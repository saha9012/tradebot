const https = require('https');
const zlib = require('zlib');
const { run, get } = require('../../db/database');
const { APP_IDS } = require('../../strategy/defaults');

const CACHE_TTL_MS = 10 * 60 * 1000;
const HTTP_TIMEOUT_MS = 12_000;
const COMMUNITY_TIMEOUT_MS = 8_000;
const NAMEID_TIMEOUT_MS = 6_000;

function withTimeout(promise, ms, label = 'timeout') {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} (${ms}ms)`)), ms);
    }),
  ]);
}

function httpGetOnce(url, cookies = '', timeoutMs = HTTP_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Accept: 'application/json, text/javascript, */*; q=0.01',
          Cookie: cookies,
          Referer: 'https://steamcommunity.com/market/',
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          if (res.statusCode === 429) {
            reject(new Error('429 Too Many Requests'));
            return;
          }
          let buf = Buffer.concat(chunks);
          const enc = res.headers['content-encoding'];
          const isGzip = buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b;
          if (enc === 'gzip' || isGzip) buf = zlib.gunzipSync(buf);
          else if (enc === 'deflate') buf = zlib.inflateSync(buf);
          resolve({ statusCode: res.statusCode, body: buf.toString('utf8') });
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error('Request timeout')));
  });
}

async function httpGet(url, cookies = '', retries = 1, timeoutMs = HTTP_TIMEOUT_MS) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await httpGetOnce(url, cookies, timeoutMs);
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  throw lastErr;
}

function parseHistogramResponse(body) {
  if (body && typeof body === 'object') return body;
  return parseJsonBody(body, 'order_histogram');
}

function gameToAppId(game) {
  return APP_IDS[game] || APP_IDS.dota;
}

function parseJsonBody(body, label) {
  const trimmed = (body || '').trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    throw new Error(`${label}: Steam вернул не JSON`);
  }
  return JSON.parse(trimmed);
}

function parseRubPrice(text) {
  if (!text) return null;
  const normalized = String(text).replace(/\u00a0/g, ' ').trim();
  const m = normalized.match(/([\d]+)[,.](\d{2})/);
  if (m) return Number(`${m[1]}.${m[2]}`);
  const ints = normalized.match(/(\d+)/);
  return ints ? Number(ints[1]) : null;
}

function extractItemNameId(html) {
  if (!html) return null;
  const text = typeof html === 'string' ? html : JSON.stringify(html);
  const spread = text.match(/Market_LoadOrderSpread\s*\(\s*(\d+)\s*\)/);
  if (spread) return spread[1];
  const embedded = text.match(/item_nameid["'\s:]+(\d+)/i);
  return embedded ? embedded[1] : null;
}

function hasCompletePrices(data) {
  return data != null && data.lowestListing != null && data.highestBuyOrder != null;
}

function communityHttpGet(community, uri, referer, { json = false } = {}) {
  return new Promise((resolve, reject) => {
    community.httpRequest(
      {
        uri,
        json,
        headers: referer ? { Referer: referer } : undefined,
      },
      (err, _response, body) => {
        if (err) reject(err);
        else if (json) resolve(body);
        else resolve(typeof body === 'string' ? body : String(body ?? ''));
      },
      'steamcommunity'
    );
  });
}

function communityGetMarketItem(community, appId, marketHashName) {
  return new Promise((resolve, reject) => {
    community.getMarketItem(appId, marketHashName, 5, (err, item) => {
      if (err) return reject(err);
      let lowestListing = null;
      let highestBuyOrder = null;
      if (item.commodity) {
        if (item.lowestPrice) lowestListing = item.lowestPrice / 100;
        if (item.highestBuyOrder != null) highestBuyOrder = item.highestBuyOrder / 100;
      } else if (item.lowestPrice) {
        lowestListing = item.lowestPrice;
      }
      resolve({
        lowestListing,
        highestBuyOrder,
        itemNameId: item.commodityID || null,
      });
    });
  });
}

function normalizeSessionArg(sessionOrCookies) {
  if (!sessionOrCookies) return { cookies: '', session: null };
  if (typeof sessionOrCookies === 'string') {
    return { cookies: sessionOrCookies, session: null };
  }
  return {
    cookies: sessionOrCookies.cookieHeader || '',
    session: sessionOrCookies,
  };
}

class PriceFetcher {
  constructor(db, rateLimiter) {
    this.db = db;
    this.rateLimiter = rateLimiter;
  }

  async getCached(appId, marketHashName) {
    const row = await get(
      this.db,
      `SELECT * FROM price_cache WHERE app_id = ? AND market_hash_name = ?`,
      [appId, marketHashName]
    );
    if (!row) return null;
    const age = Date.now() - new Date(row.updated_at).getTime();
    if (age > CACHE_TTL_MS) return null;
    const data = JSON.parse(row.data_json);
    if (!hasCompletePrices(data)) return null;
    return data;
  }

  async getStaleItemNameId(appId, marketHashName) {
    const row = await get(
      this.db,
      `SELECT data_json FROM price_cache WHERE app_id = ? AND market_hash_name = ?`,
      [appId, marketHashName]
    );
    if (!row) return null;
    try {
      const data = JSON.parse(row.data_json);
      return data.itemNameId || null;
    } catch {
      return null;
    }
  }

  async patchItemNameId(appId, marketHashName, itemNameId) {
    if (!itemNameId) return;
    const row = await get(
      this.db,
      `SELECT data_json FROM price_cache WHERE app_id = ? AND market_hash_name = ?`,
      [appId, marketHashName]
    );
    let data = { appId, marketHashName, itemNameId: String(itemNameId) };
    if (row) {
      try {
        data = { ...JSON.parse(row.data_json), itemNameId: String(itemNameId) };
      } catch {
        /* use default */
      }
    }
    await run(
      this.db,
      `INSERT OR REPLACE INTO price_cache (app_id, market_hash_name, data_json, updated_at)
       VALUES (?, ?, ?, datetime('now'))`,
      [appId, marketHashName, JSON.stringify(data)]
    );
  }

  async setCache(appId, marketHashName, data) {
    await run(
      this.db,
      `INSERT OR REPLACE INTO price_cache (app_id, market_hash_name, data_json, updated_at)
       VALUES (?, ?, ?, datetime('now'))`,
      [appId, marketHashName, JSON.stringify(data)]
    );
  }

  async fetchPriceOverview(appId, marketHashName, cookies) {
    const encoded = encodeURIComponent(marketHashName);
    const url =
      `https://steamcommunity.com/market/priceoverview/?appid=${appId}&currency=5&market_hash_name=${encoded}`;
    const { body } = await httpGet(url, cookies, 0, HTTP_TIMEOUT_MS);
    const ov = parseJsonBody(body, 'priceoverview');
    if (!ov.success) return null;
    return parseRubPrice(ov.lowest_price);
  }

  async fetchOrderHistogram(appId, marketHashName, itemNameId, cookies, community) {
    const referer = `https://steamcommunity.com/market/listings/${appId}/${encodeURIComponent(marketHashName)}`;
    const histUrl =
      `https://steamcommunity.com/market/itemordershistogram?country=RU&language=english&currency=5&item_nameid=${itemNameId}&two_factor=0`;

    let orders;
    if (community) {
      const body = await withTimeout(
        communityHttpGet(community, histUrl, referer),
        COMMUNITY_TIMEOUT_MS,
        'histogram'
      );
      orders = parseHistogramResponse(body);
    } else {
      const { body } = await httpGet(histUrl, cookies, 0, HTTP_TIMEOUT_MS);
      orders = parseHistogramResponse(body);
    }

    if (!orders.success) return { lowestListing: null, highestBuyOrder: null };
    return {
      lowestListing: orders.lowest_sell_order ? Number(orders.lowest_sell_order) / 100 : null,
      highestBuyOrder: orders.highest_buy_order ? Number(orders.highest_buy_order) / 100 : null,
    };
  }

  async fetchItemNameIdLight(appId, marketHashName, cookies, community) {
    const encoded = encodeURIComponent(marketHashName);
    const url =
      `https://steamcommunity.com/market/listings/${appId}/${encoded}/render/?start=0&count=1&currency=5&language=english`;
    const referer = `https://steamcommunity.com/market/listings/${appId}/${encoded}`;

    if (community) {
      const parsed = await communityHttpGet(community, url, referer, { json: true });
      const fromHtml = extractItemNameId(parsed?.results_html || '');
      if (fromHtml) return fromHtml;
      return extractItemNameId(JSON.stringify(parsed || ''));
    }

    const { body } = await httpGet(url, cookies, 0, NAMEID_TIMEOUT_MS);
    let itemNameId = extractItemNameId(body);
    if (!itemNameId && body?.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(body);
        itemNameId = extractItemNameId(parsed.results_html || '');
      } catch {
        /* ignore */
      }
    }
    return itemNameId;
  }

  refreshSalesVolume(appId, marketHashName, cookies) {
    const encoded = encodeURIComponent(marketHashName);
    const historyUrl =
      `https://steamcommunity.com/market/pricehistory/?appid=${appId}&market_hash_name=${encoded}&currency=5`;

    this.rateLimiter
      .schedule(async () => {
        const { body } = await httpGet(historyUrl, cookies, 0, HTTP_TIMEOUT_MS);
        const history = parseJsonBody(body, 'pricehistory');
        if (!history.success || !history.prices?.length) return;

        const now = Date.now();
        const dayAgo = now - 86400000;
        const weekAgo = now - 7 * 86400000;
        let salesPerDay = 0;
        let salesPerWeek = 0;
        for (const p of history.prices) {
          const t = new Date(p[0]).getTime();
          if (t > dayAgo) salesPerDay += 1;
          if (t > weekAgo) salesPerWeek += 1;
        }

        const row = await get(
          this.db,
          `SELECT data_json FROM price_cache WHERE app_id = ? AND market_hash_name = ?`,
          [appId, marketHashName]
        );
        if (!row) return;
        const data = JSON.parse(row.data_json);
        data.salesPerDay = salesPerDay;
        data.salesPerWeek = salesPerWeek;
        await this.setCache(appId, marketHashName, data);
      })
      .catch(() => {});
  }

  /**
   * Быстрая загрузка цен: priceoverview + histogram (без тяжёлых HTML-страниц).
   * @param {object|string|null} sessionOrCookies
   * @param {{ hintLowestRub?: number }} [options]
   */
  async fetchItem(appId, marketHashName, sessionOrCookies = null, options = {}) {
    const { cookies, session } = normalizeSessionArg(sessionOrCookies);
    const cached = await this.getCached(appId, marketHashName);
    if (cached) return cached;

    return this.rateLimiter.schedule(async () => {
      let lowestListing = null;
      let highestBuyOrder = null;
      let itemNameId = await this.getStaleItemNameId(appId, marketHashName);
      const errors = [];

      try {
        lowestListing = await this.fetchPriceOverview(appId, marketHashName, cookies);
      } catch (err) {
        errors.push(`priceoverview: ${err.message}`);
      }

      if (lowestListing == null && options.hintLowestRub > 0) {
        lowestListing = options.hintLowestRub;
      }

      if (!itemNameId) {
        try {
          itemNameId = await withTimeout(
            this.fetchItemNameIdLight(appId, marketHashName, cookies, session?.community),
            NAMEID_TIMEOUT_MS,
            'item_nameid'
          );
        } catch (err) {
          errors.push(`item_nameid: ${err.message}`);
        }
      }

      if (itemNameId) {
        await this.patchItemNameId(appId, marketHashName, itemNameId);
        if (!hasCompletePrices({ lowestListing, highestBuyOrder })) {
          try {
            const hist = await this.fetchOrderHistogram(
              appId,
              marketHashName,
              itemNameId,
              cookies,
              session?.community
            );
            lowestListing = lowestListing ?? hist.lowestListing;
            highestBuyOrder = highestBuyOrder ?? hist.highestBuyOrder;
          } catch (err) {
            errors.push(`histogram: ${err.message}`);
          }
        }
      }

      if (!hasCompletePrices({ lowestListing, highestBuyOrder }) && session?.community) {
        try {
          const fromCommunity = await withTimeout(
            communityGetMarketItem(session.community, appId, marketHashName),
            COMMUNITY_TIMEOUT_MS,
            'community'
          );
          lowestListing = lowestListing ?? fromCommunity.lowestListing;
          highestBuyOrder = highestBuyOrder ?? fromCommunity.highestBuyOrder;
          if (fromCommunity.itemNameId) {
            itemNameId = fromCommunity.itemNameId;
            await this.patchItemNameId(appId, marketHashName, itemNameId);
          }
        } catch (err) {
          errors.push(`community: ${err.message}`);
        }
      }

      if (!hasCompletePrices({ lowestListing, highestBuyOrder })) {
        const hint = errors.length ? errors.join('; ') : 'нет item_nameid или ордеров';
        throw new Error(`Не удалось получить цены лота (${hint})`);
      }

      const data = {
        appId,
        marketHashName,
        lowestListing,
        highestBuyOrder,
        salesPerDay: 0,
        salesPerWeek: 0,
        itemNameId: itemNameId ? String(itemNameId) : null,
        fetchedAt: new Date().toISOString(),
      };

      await this.setCache(appId, marketHashName, data);
      this.refreshSalesVolume(appId, marketHashName, cookies);
      return data;
    });
  }

  async searchMarketRender(appId, query = '', cookies = '', { start = 0, count = 100 } = {}) {
    const url =
      `https://steamcommunity.com/market/search/render/?appid=${appId}` +
      `&norender=1&count=${count}&start=${start}` +
      `&query=${encodeURIComponent(query)}&search_descriptions=0` +
      `&sort_column=price&sort_dir=asc&currency=5`;

    const { body } = await this.rateLimiter.schedule(() => httpGet(url, cookies, 0, HTTP_TIMEOUT_MS));
    return this.parseSearchRender(body);
  }

  parseSearchRender(body) {
    const data = parseJsonBody(body, 'search');
    if (!data.success) {
      throw new Error(data.error || 'Steam: неуспешный ответ поиска');
    }
    const results = (data.results || []).map((r) => ({
      hash_name: r.hash_name || r.market_hash_name || r.name,
      name: r.name,
      sell_price: r.sell_price,
    }));
    return { results, totalCount: data.total_count || results.length };
  }

  async browseMarket(appId, cookies = '', { start = 0, count = 100 } = {}) {
    const url =
      `https://steamcommunity.com/market/search/render/?appid=${appId}` +
      `&norender=1&count=${count}&start=${start}&sort_column=popular&sort_dir=desc&currency=5`;

    const { body } = await this.rateLimiter.schedule(() => httpGet(url, cookies, 0, HTTP_TIMEOUT_MS));
    return this.parseSearchRender(body);
  }

  async searchMarket(community, appId, query = '', start = 0) {
    return this.searchMarketRender(appId, query, '');
  }
}

module.exports = { PriceFetcher, gameToAppId, hasCompletePrices, parseRubPrice };
