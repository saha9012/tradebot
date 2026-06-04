const https = require('https');
const zlib = require('zlib');
const { run, get } = require('../../db/database');
const {
  getStoredItemNameId,
  saveItemNameId,
  isValidItemNameId,
} = require('../../db/itemNameIdStore');
const {
  runParallelStrategies,
  nameIdSuccess,
  histogramSuccess,
} = require('./strategyProbe');
const { probePlaywrightMarket } = require('./playwrightMarket');
const { logFetchStep } = require('../../db/fetchDebugLog');
const { logProbeToDb, compactProbeResults } = require('../../db/fetchDebugCompact');
const { APP_IDS } = require('../../strategy/defaults');
const {
  mergeSearchRenderPayload,
  parseOrderbookResponse,
  parsePriceOverviewResponse,
} = require('../../market/marketDomParser');

const CACHE_TTL_MS = 10 * 60 * 1000;
const HTTP_TIMEOUT_MS = 15_000;
const COMMUNITY_TIMEOUT_MS = 15_000;
const STEAM_MARKET_TIMEOUT_MS = 20_000;
const NAMEID_TIMEOUT_MS = 8_000;
const MARKET_HTTP_RETRIES = 2;

function withTimeout(fnOrPromise, ms, label = 'timeout') {
  const promise = typeof fnOrPromise === 'function' ? fnOrPromise() : fnOrPromise;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} (${ms}ms)`)), ms);
    }),
  ]);
}

function appendSessionId(url, sessionID) {
  if (!sessionID) return url;
  const sep = url.includes('?') ? '&' : '?';
  if (url.includes('sessionid=')) return url;
  return `${url}${sep}sessionid=${encodeURIComponent(sessionID)}`;
}

function httpGetOnce(url, cookies = '', timeoutMs = HTTP_TIMEOUT_MS, sessionID = null) {
  const finalUrl = appendSessionId(url, sessionID);
  return new Promise((resolve, reject) => {
    const req = https.get(
      finalUrl,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Accept: 'application/json, text/javascript, */*; q=0.01',
          'X-Requested-With': 'XMLHttpRequest',
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetriableError(err) {
  const msg = formatSteamError(err).toLowerCase();
  const code = String(err?.code || '').toLowerCase();
  return (
    code === 'econnreset' ||
    code === 'etimedout' ||
    code === 'econnrefused' ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('timeout') ||
    msg.includes('socket hang up') ||
    msg.includes('429')
  );
}

async function withRetries(fn, { retries = 2, delayMs = 2000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < retries && isRetriableError(err)) {
        await sleep(delayMs * (attempt + 1));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

async function httpGet(url, cookies = '', retries = MARKET_HTTP_RETRIES, timeoutMs = HTTP_TIMEOUT_MS, sessionID = null) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await httpGetOnce(url, cookies, timeoutMs, sessionID);
    } catch (err) {
      lastErr = err;
      if (attempt < retries && isRetriableError(err)) {
        await sleep(1500 * (attempt + 1));
        continue;
      }
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

function extractItemNameId(html) {
  if (!html) return null;
  const text = typeof html === 'string' ? html : JSON.stringify(html);
  const spread = text.match(/Market_LoadOrderSpread\s*\(\s*(\d+)\s*\)/);
  if (spread) return spread[1];
  const embedded = text.match(/item_nameid["'\s:]+(\d+)/i);
  if (embedded) return embedded[1];
  const histParam = text.match(/itemordershistogram[^"']*item_nameid=(\d+)/i);
  if (histParam) return histParam[1];
  const dataAttr = text.match(/data-item-nameid=["'](\d+)["']/i);
  if (dataAttr) return dataAttr[1];
  return extractNameIdFromAssets(text);
}

function extractNameIdFromAssets(html) {
  if (!html) return null;
  const m = html.match(/g_rgAssets\s*=\s*(\{[\s\S]*?\});/);
  if (!m) return null;
  try {
    return extractItemNameId(JSON.stringify(JSON.parse(m[1])));
  } catch {
    return null;
  }
}

function hasCompletePrices(data) {
  return data != null && data.lowestListing != null && data.highestBuyOrder != null;
}

function formatSteamError(err) {
  if (err == null) return 'неизвестная ошибка';
  if (typeof err === 'string') return err;
  const parts = [
    err.message,
    err.eresult != null ? `EResult ${err.eresult}` : null,
    err.code != null ? `code ${err.code}` : null,
  ].filter(Boolean);
  if (parts.length) return parts.join(' — ');
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function diagnoseSteamBody(statusCode, body) {
  const text = (body || '').slice(0, 80000);
  const lower = text.toLowerCase();
  const trimmed = text.trim();
  const isJson = trimmed.startsWith('{') || trimmed.startsWith('[');
  let jsonSuccess = null;
  let jsonMessage = null;
  if (isJson) {
    try {
      const parsed = JSON.parse(trimmed);
      jsonSuccess = parsed.success;
      jsonMessage = parsed.message || null;
    } catch {
      jsonSuccess = 'parse_error';
    }
  }
  return {
    statusCode: statusCode ?? null,
    bodyLength: text.length,
    responseKind: isJson ? 'json' : 'html',
    jsonSuccess,
    jsonMessage,
    bodyPreview: trimmed.slice(0, 140).replace(/\s+/g, ' '),
    hasLoadOrderSpread: /Market_LoadOrderSpread\s*\(\s*\d+/i.test(text),
    hasMarketListingUi: /market_listing|market_commodity|buyorder/i.test(text),
    looksLikeLogin:
      lower.includes('g_steamid = false') ||
      lower.includes('joinsteam') ||
      lower.includes('sign in') ||
      lower.includes('войти в steam'),
    looksLikeAgeGate: lower.includes('agecheck') || lower.includes('birth date'),
    looksLikeRateLimit: statusCode === 429 || lower.includes('too many requests'),
    title: text.match(/<title[^>]*>([^<]+)/i)?.[1]?.trim()?.slice(0, 120) || null,
    whyNoNameid: isJson
      ? jsonSuccess === false
        ? `JSON success=false: ${jsonMessage || '?'}`
        : 'в JSON нет Market_LoadOrderSpread'
      : /Market_LoadOrderSpread/i.test(text)
        ? 'есть упоминание, но без числа'
        : 'HTML-оболочка без ордербука (нужен браузер/JS)',
  };
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

  /** Каждый вызов Steam — отдельный слот очереди (пауза между запросами). */
  scheduleSteam(label, fn) {
    return this.rateLimiter.schedule(async () => {
      try {
        return await fn();
      } catch (err) {
        throw new Error(`${label}: ${formatSteamError(err)}`);
      }
    });
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

  async setCache(appId, marketHashName, data) {
    await run(
      this.db,
      `INSERT OR REPLACE INTO price_cache (app_id, market_hash_name, data_json, updated_at)
       VALUES (?, ?, ?, datetime('now'))`,
      [appId, marketHashName, JSON.stringify(data)]
    );
  }

  listingUrls(appId, marketHashName) {
    const encoded = encodeURIComponent(marketHashName);
    const listingUrl = `https://steamcommunity.com/market/listings/${appId}/${encoded}`;
    const renderUrl =
      `https://steamcommunity.com/market/listings/${appId}/${encoded}/render/?start=0&count=1&currency=5&language=russian&format=json`;
    return { listingUrl, renderUrl };
  }

  orderbookUrl(appId, marketHashName) {
    const qp = JSON.stringify([Number(appId), marketHashName]);
    return `https://steamcommunity.com/market/orderbook?q=Load&qp=${encodeURIComponent(qp)}`;
  }

  priceOverviewUrl(appId, marketHashName) {
    const encoded = encodeURIComponent(marketHashName);
    return `https://steamcommunity.com/market/priceoverview/?appid=${appId}&currency=5&market_hash_name=${encoded}`;
  }

  async fetchPriceOverviewRaw(appId, marketHashName, session) {
    const { cookies, session: sess } = normalizeSessionArg(session);
    const url = this.priceOverviewUrl(appId, marketHashName);
    const { listingUrl } = this.listingUrls(appId, marketHashName);
    const sessionID = sess?.sessionID || null;

    if (sess?.community) {
      try {
        const body = await withTimeout(
          communityHttpGet(sess.community, url, listingUrl, { json: true }),
          COMMUNITY_TIMEOUT_MS,
          'priceoverview'
        );
        return { body, via: 'community_priceoverview' };
      } catch {
        /* http fallback */
      }
    }

    const { body: raw } = await httpGet(url, cookies, MARKET_HTTP_RETRIES, HTTP_TIMEOUT_MS, sessionID);
    const body =
      raw && typeof raw === 'object' ? raw : parseJsonBody(String(raw || ''), 'priceoverview');
    return { body, via: 'http_priceoverview' };
  }

  /** Ликвидность: volume из priceoverview = продажи за последние 24 часа. */
  async fetchSalesVolumeFromPriceOverview(appId, marketHashName, session) {
    const { body, via } = await this.fetchPriceOverviewRaw(appId, marketHashName, session);
    const parsed = parsePriceOverviewResponse(body);
    const salesPerDay = parsed.volume24h ?? 0;
    return {
      salesPerDay,
      via,
      volumeRaw: parsed.volumeRaw,
      lowestPriceRub: parsed.lowestPriceRub,
      medianPriceRub: parsed.medianPriceRub,
      priceOverviewUrl: this.priceOverviewUrl(appId, marketHashName),
      raw: body,
      error: parsed.error,
    };
  }

  async fetchOrderbookRaw(appId, marketHashName, session) {
    const { cookies, session: sess } = normalizeSessionArg(session);
    const url = this.orderbookUrl(appId, marketHashName);
    const { listingUrl } = this.listingUrls(appId, marketHashName);
    const sessionID = sess?.sessionID || null;

    if (sess?.community) {
      try {
        const body = await withTimeout(
          communityHttpGet(sess.community, url, listingUrl, { json: true }),
          COMMUNITY_TIMEOUT_MS,
          'orderbook'
        );
        return { body, via: 'community_orderbook' };
      } catch {
        /* http fallback */
      }
    }

    const { body: raw } = await httpGet(url, cookies, MARKET_HTTP_RETRIES, HTTP_TIMEOUT_MS, sessionID);
    const body =
      raw && typeof raw === 'object' ? raw : parseJsonBody(String(raw || ''), 'orderbook');
    return { body, via: 'http_orderbook' };
  }

  /** steam-market (сессия после логина). */
  async fetchNameIdFromSteamMarket(market, appId, marketHashName) {
    return withRetries(
      () =>
        withTimeout(async () => {
          const page = await market.listings(appId, marketHashName);
          const id = await page.itemNameId();
          return id ? String(id) : null;
        }, STEAM_MARKET_TIMEOUT_MS, 'steam_market'),
      { retries: 2, delayMs: 2500 }
    );
  }

  async fetchHistogramViaSteamMarket(market, appId, marketHashName, itemNameId) {
    const hist = await withRetries(
      () =>
        withTimeout(
          () => market.itemOrdersHistogram(appId, marketHashName, Number(itemNameId)),
          STEAM_MARKET_TIMEOUT_MS,
          'steam_market_hist'
        ),
      { retries: 2, delayMs: 2500 }
    );
    if (!hist.success) {
      const hint = hist._data?.message || hist._data?.error || `success=${hist._data?.success}`;
      throw new Error(`histogram: ${hint}`);
    }
    return {
      lowestListing: hist.lowestSellOrder,
      highestBuyOrder: hist.highestBuyOrder,
      itemNameId: String(itemNameId),
      raw: hist._data,
    };
  }

  extractNameIdFromHtml(body, statusCode, via, url = null, sessionID = null) {
    const itemNameId = extractItemNameId(body) || extractNameIdFromAssets(body);
    return {
      itemNameId: itemNameId || null,
      meta: { via, url, sessionID: sessionID || null, ...diagnoseSteamBody(statusCode, body) },
      error: itemNameId ? null : 'nameid не найден в ответе',
    };
  }

  async probeHttpPage(url, cookies, sessionID = null) {
    const { statusCode, body } = await httpGet(url, cookies, 1, HTTP_TIMEOUT_MS, sessionID);
    return this.extractNameIdFromHtml(body, statusCode, 'http', url, sessionID);
  }

  async probeHttpRender(url, cookies, sessionID = null) {
    const { statusCode, body } = await httpGet(url, cookies, 1, HTTP_TIMEOUT_MS, sessionID);
    let parsed = null;
    try {
      if (body?.trim().startsWith('{')) parsed = JSON.parse(body);
    } catch {
      /* ignore */
    }
    const html = parsed?.results_html || body;
    const base = this.extractNameIdFromHtml(html, statusCode, 'http', url);
    return {
      ...base,
      meta: {
        ...base.meta,
        steamSuccess: parsed?.success ?? null,
        steamMessage: parsed?.message ?? null,
      },
    };
  }

  async probeHttpSearch(appId, marketHashName, cookies) {
    const q = encodeURIComponent(marketHashName);
    const url =
      `https://steamcommunity.com/market/search/render/?appid=${appId}` +
      `&query=${q}&norender=1&count=10&currency=5`;
    const { statusCode, body } = await httpGet(url, cookies, 1, HTTP_TIMEOUT_MS);
    let parsed = null;
    try {
      parsed = JSON.parse(body);
    } catch {
      return { itemNameId: null, meta: { via: 'search', url }, error: 'не JSON' };
    }
    const html = `${parsed.results_html || ''} ${JSON.stringify(parsed)}`;
    return this.extractNameIdFromHtml(html, statusCode, 'search', url);
  }

  async probeCommunityPage(community, url, referer) {
    const body = await withTimeout(
      communityHttpGet(community, url, referer || url),
      COMMUNITY_TIMEOUT_MS,
      'community'
    );
    return this.extractNameIdFromHtml(body, 200, 'community', url);
  }

  async probeCommunityRender(community, renderUrl, listingUrl) {
    const body = await withTimeout(
      communityHttpGet(community, renderUrl, listingUrl, { json: true }),
      COMMUNITY_TIMEOUT_MS,
      'community_render'
    );
    const html =
      body && typeof body === 'object'
        ? body.results_html || JSON.stringify(body)
        : String(body || '');
    const base = this.extractNameIdFromHtml(html, 200, 'community_render', renderUrl);
    return {
      ...base,
      meta: {
        ...base.meta,
        steamSuccess: body?.success ?? null,
      },
    };
  }

  /**
   * Параллельно все способы получить item_nameid (один слот очереди, много запросов сразу).
   */
  async probeAllNameIdStrategies(appId, marketHashName, cookies, community, market, session = null) {
    const sessionID = session?.sessionID || null;
    const { listingUrl, renderUrl } = this.listingUrls(appId, marketHashName);
    const encoded = encodeURIComponent(marketHashName);
    const listingRu = `${listingUrl}?l=russian`;
    const listingEn = `${listingUrl}?l=english`;
    const renderRu10 =
      `https://steamcommunity.com/market/listings/${appId}/${encoded}` +
      `/render/?start=0&count=10&currency=5&language=russian&country=RU&format=json`;
    const renderEn10 =
      `https://steamcommunity.com/market/listings/${appId}/${encoded}` +
      `/render/?start=0&count=10&currency=5&language=english&country=US&format=json`;

    const strategies = [];

    if (market) {
      strategies.push({
        id: 'steam_market',
        run: async () => {
          try {
            const id = await this.fetchNameIdFromSteamMarket(market, appId, marketHashName);
            return {
              itemNameId: id,
              meta: { via: 'steam_market' },
              error: isValidItemNameId(id) ? null : 'Value itemNameId not found',
            };
          } catch (err) {
            return { itemNameId: null, error: formatSteamError(err) };
          }
        },
      });
    }

    if (cookies) {
      strategies.push({
        id: 'http_listing',
        run: () => this.probeHttpPage(listingUrl, cookies, sessionID),
      });
      strategies.push({
        id: 'http_listing_en',
        run: () => this.probeHttpPage(listingEn, cookies, sessionID),
      });
      strategies.push({
        id: 'http_listing_ru',
        run: () => this.probeHttpPage(listingRu, cookies, sessionID),
      });
      strategies.push({
        id: 'http_render',
        run: () => this.probeHttpRender(renderUrl, cookies, sessionID),
      });
      if (sessionID) {
        strategies.push({
          id: 'http_render_sid',
          run: () =>
            this.probeHttpRender(appendSessionId(renderUrl, sessionID), cookies, sessionID),
        });
        strategies.push({
          id: 'http_render_ru10_sid',
          run: () =>
            this.probeHttpRender(appendSessionId(renderRu10, sessionID), cookies, sessionID),
        });
      }
      strategies.push({
        id: 'http_render_ru10',
        run: () => this.probeHttpRender(renderRu10, cookies, sessionID),
      });
      strategies.push({
        id: 'http_render_en10',
        run: () => this.probeHttpRender(renderEn10, cookies, sessionID),
      });
      strategies.push({
        id: 'http_search',
        run: () => this.probeHttpSearch(appId, marketHashName, cookies),
      });
    }

    if (community) {
      strategies.push({
        id: 'community_listing',
        run: () => this.probeCommunityPage(community, listingUrl, listingUrl),
      });
      strategies.push({
        id: 'community_render',
        run: () => this.probeCommunityRender(community, renderUrl, listingUrl),
      });
    }

    const tried = strategies.map((s) => s.id);
    let { steps, winner } = await runParallelStrategies(strategies, nameIdSuccess);
    let playwrightPrices = null;

    const usePlaywright = process.env.BOT_PLAYWRIGHT_NAMEID !== 'false';
    if (!winner && cookies && usePlaywright) {
      const pw = await this.probePlaywrightNameId(listingUrl, session);
      steps.push({
        step: 'playwright_listing',
        ok: nameIdSuccess(pw),
        itemNameId: pw.itemNameId,
        error: pw.error,
        meta: pw.meta,
        ms: pw.ms,
      });
      tried.push('playwright_listing');
      if (nameIdSuccess(pw)) {
        winner = { id: 'playwright_listing', value: pw };
        playwrightPrices = pw.prices;
      }
    }

    const batchMeta = {
      parallel: true,
      tried,
      winner: winner?.id || null,
      playwrightEnabled: usePlaywright,
      hint: !winner
        ? 'Сводка в results[]. Детали каждой стратегии — BOT_VERBOSE_FETCH_DEBUG=true'
        : null,
    };
    steps.unshift({
      step: 'nameid_probe_batch',
      ok: Boolean(winner),
      itemNameId: winner?.value?.itemNameId || null,
      meta: batchMeta,
    });
    const batchRow = steps.find((s) => s.step === 'nameid_probe_batch');
    if (batchRow) {
      batchRow.meta.results = compactProbeResults(steps, 'nameid_probe_batch');
    }

    return {
      steps,
      itemNameId: winner?.value?.itemNameId || null,
      winnerId: winner?.id || null,
      playwrightPrices,
    };
  }

  async probePlaywrightNameId(listingUrl, session) {
    const started = Date.now();
    const result = await probePlaywrightMarket(listingUrl, {
      cookieHeader: session?.cookieHeader,
      webCookies: session?.webCookies,
      sessionID: session?.sessionID,
      community: session?.community,
    });
    return { ...result, ms: Date.now() - started };
  }

  async resolveItemNameIdFromNetwork(appId, marketHashName, cookies, community, market, session) {
    const { steps, itemNameId, winnerId, playwrightPrices } = await this.probeAllNameIdStrategies(
      appId,
      marketHashName,
      cookies,
      community,
      market,
      session
    );
    if (isValidItemNameId(itemNameId)) {
      await saveItemNameId(this.db, appId, marketHashName, itemNameId, winnerId || 'probe');
    }
    return { itemNameId: itemNameId || null, steps, playwrightPrices };
  }

  async fetchOrderHistogramUrl(histUrl, cookies, community, referer) {
    let orders;
    if (community) {
      const body = await withTimeout(
        communityHttpGet(community, histUrl, referer),
        COMMUNITY_TIMEOUT_MS,
        'histogram'
      );
      orders = parseHistogramResponse(body);
    } else {
      const { body } = await httpGet(histUrl, cookies, 1, HTTP_TIMEOUT_MS);
      orders = parseHistogramResponse(body);
    }
    if (!orders.success) {
      return {
        lowestListing: null,
        highestBuyOrder: null,
        raw: orders,
        error: `success=${orders.success}`,
      };
    }
    return {
      lowestListing: orders.lowest_sell_order ? Number(orders.lowest_sell_order) / 100 : null,
      highestBuyOrder: orders.highest_buy_order ? Number(orders.highest_buy_order) / 100 : null,
      raw: orders,
    };
  }

  async probeAllHistogramStrategies(appId, marketHashName, itemNameId, cookies, community, market) {
    const referer = `https://steamcommunity.com/market/listings/${appId}/${encodeURIComponent(marketHashName)}`;
    const base =
      `https://steamcommunity.com/market/itemordershistogram?language=english&item_nameid=${itemNameId}&two_factor=0`;

    const strategies = [
      {
        id: 'http_histogram_ru',
        run: async () => {
          const h = await this.fetchOrderHistogramUrl(
            `${base}&country=RU&currency=5`,
            cookies,
            null,
            referer
          );
          return {
            ...h,
            itemNameId,
            error: histogramSuccess(h) ? null : h.error || 'нет цен',
          };
        },
      },
      {
        id: 'http_histogram_us',
        run: async () => {
          const h = await this.fetchOrderHistogramUrl(
            `${base}&country=US&currency=1`,
            cookies,
            null,
            referer
          );
          return {
            ...h,
            itemNameId,
            error: histogramSuccess(h) ? null : h.error || 'нет цен',
          };
        },
      },
    ];

    if (community) {
      strategies.push({
        id: 'community_histogram_ru',
        run: async () => {
          const h = await this.fetchOrderHistogramUrl(
            `${base}&country=RU&currency=5`,
            cookies,
            community,
            referer
          );
          return {
            ...h,
            itemNameId,
            error: histogramSuccess(h) ? null : h.error || 'нет цен',
          };
        },
      });
    }

    if (market) {
      strategies.push({
        id: 'steam_market_hist',
        run: async () => {
          try {
            const h = await this.fetchHistogramViaSteamMarket(
              market,
              appId,
              marketHashName,
              itemNameId
            );
            return {
              lowestListing: h.lowestListing,
              highestBuyOrder: h.highestBuyOrder,
              itemNameId,
              raw: h.raw,
              error: null,
            };
          } catch (err) {
            return { itemNameId, error: formatSteamError(err) };
          }
        },
      });
    }

    const { steps, winner } = await runParallelStrategies(strategies, histogramSuccess);

    const histMeta = {
      parallel: true,
      itemNameId,
      tried: strategies.map((s) => s.id),
      winner: winner?.id || null,
      prices: winner
        ? {
            buy: winner.value.highestBuyOrder,
            sell: winner.value.lowestListing,
          }
        : null,
    };
    steps.unshift({
      step: 'histogram_probe_batch',
      ok: Boolean(winner),
      meta: histMeta,
    });
    const histBatch = steps.find((s) => s.step === 'histogram_probe_batch');
    if (histBatch) {
      histBatch.meta.results = compactProbeResults(steps, 'histogram_probe_batch');
    }

    return {
      steps,
      hist: winner?.value || null,
      winnerId: winner?.id || null,
    };
  }

  async saveResolvedNameId(appId, marketHashName, itemNameId, source) {
    if (!isValidItemNameId(itemNameId)) return null;
    await saveItemNameId(this.db, appId, marketHashName, itemNameId, source);
    return { itemNameId: String(itemNameId), source };
  }

  /**
   * nameid: БД → steam-market → community render → http render (+sessionid) → search → playwright.
   */
  async resolveItemNameIdQuick(
    appId,
    marketHashName,
    cookies,
    community,
    market = null,
    session = null
  ) {
    const cached = await getStoredItemNameId(this.db, appId, marketHashName);
    if (cached) return { itemNameId: cached, source: 'db' };

    const sessionID = session?.sessionID || null;
    const { listingUrl, renderUrl } = this.listingUrls(appId, marketHashName);
    const attempts = [];

    if (market) {
      try {
        const id = await this.fetchNameIdFromSteamMarket(market, appId, marketHashName);
        if (isValidItemNameId(id)) {
          return this.saveResolvedNameId(appId, marketHashName, id, 'steam_market');
        }
        attempts.push('steam_market: пусто');
      } catch (e) {
        attempts.push(`steam_market: ${formatSteamError(e)}`);
      }
    }

    if (community) {
      try {
        const r = await this.probeCommunityRender(community, renderUrl, listingUrl);
        if (isValidItemNameId(r.itemNameId)) {
          return this.saveResolvedNameId(appId, marketHashName, r.itemNameId, 'community_render');
        }
        attempts.push(`community_render: ${r.error || r.meta?.whyNoNameid || 'нет'}`);
      } catch (e) {
        attempts.push(`community_render: ${formatSteamError(e)}`);
      }
    }

    try {
      const r = await this.probeHttpRender(renderUrl, cookies, sessionID);
      if (isValidItemNameId(r.itemNameId)) {
        return this.saveResolvedNameId(appId, marketHashName, r.itemNameId, 'http_render');
      }
      attempts.push(`http_render: ${r.error || r.meta?.whyNoNameid || 'нет'}`);
    } catch (e) {
      attempts.push(`http_render: ${formatSteamError(e)}`);
    }

    try {
      const r = await this.probeHttpSearch(appId, marketHashName, cookies);
      if (isValidItemNameId(r.itemNameId)) {
        return this.saveResolvedNameId(appId, marketHashName, r.itemNameId, 'http_search');
      }
      attempts.push(`http_search: ${r.error || 'нет'}`);
    } catch (e) {
      attempts.push(`http_search: ${formatSteamError(e)}`);
    }

    if (community) {
      try {
        const r = await this.probeCommunityPage(community, listingUrl, listingUrl);
        if (isValidItemNameId(r.itemNameId)) {
          return this.saveResolvedNameId(appId, marketHashName, r.itemNameId, 'community_listing');
        }
        attempts.push(`community_listing: ${r.error || 'нет'}`);
      } catch (e) {
        attempts.push(`community_listing: ${formatSteamError(e)}`);
      }
    }

    try {
      const r = await this.probeHttpPage(listingUrl, cookies, sessionID);
      if (isValidItemNameId(r.itemNameId)) {
        return this.saveResolvedNameId(appId, marketHashName, r.itemNameId, 'listing_http');
      }
      attempts.push(`listing_http: ${r.error || r.meta?.whyNoNameid || 'нет'}`);
    } catch (e) {
      attempts.push(`listing_http: ${formatSteamError(e)}`);
    }

    if (process.env.BOT_PLAYWRIGHT_NAMEID === 'true' && session) {
      try {
        const pw = await probePlaywrightMarket(listingUrl, {
          cookieHeader: session.cookieHeader,
          webCookies: session.webCookies,
          sessionID: session.sessionID,
          community: session.community,
        });
        if (isValidItemNameId(pw.itemNameId)) {
          return this.saveResolvedNameId(appId, marketHashName, pw.itemNameId, 'playwright');
        }
        attempts.push(`playwright: ${pw.error || pw.meta?.error || 'нет'}`);
      } catch (e) {
        attempts.push(`playwright: ${formatSteamError(e)}`);
      }
    }

    return { itemNameId: null, source: null, attempts };
  }

  /** Один histogram: highest buy + lowest sell (ордербук). */
  async fetchBuyOrderForItem(appId, marketHashName, sessionOrCookies, ctx = null) {
    const { cookies, session } = normalizeSessionArg(sessionOrCookies);
    const community = session?.community;
    const market = session?.market || ctx?.market || null;

    const resolved = await this.scheduleSteam('nameid_quick', () =>
      this.resolveItemNameIdQuick(appId, marketHashName, cookies, community, market, session)
    );
    const { itemNameId, source, attempts } = resolved;
    if (!isValidItemNameId(itemNameId)) {
      return {
        itemNameId: null,
        highestBuyOrder: null,
        lowestListing: null,
        error: 'нет item_nameid',
        attempts: attempts || null,
      };
    }

    if (market) {
      try {
        const h = await this.scheduleSteam('buy_histogram', () =>
          this.fetchHistogramViaSteamMarket(market, appId, marketHashName, itemNameId)
        );
        if (h.highestBuyOrder != null) {
          return {
            itemNameId,
            highestBuyOrder: h.highestBuyOrder,
            lowestListing: h.lowestListing,
            raw: h.raw,
            nameIdSource: source,
            error: null,
          };
        }
      } catch {
        /* fallback community/http */
      }
    }

    const referer = `https://steamcommunity.com/market/listings/${appId}/${encodeURIComponent(marketHashName)}`;
    const histUrl =
      `https://steamcommunity.com/market/itemordershistogram?country=RU&language=russian&currency=5&item_nameid=${itemNameId}&two_factor=0`;

    const hist = await this.scheduleSteam('buy_histogram', () =>
      this.fetchOrderHistogramUrl(histUrl, cookies, community, referer)
    );
    if (hist.highestBuyOrder == null) {
      return {
        itemNameId,
        highestBuyOrder: null,
        lowestListing: hist.lowestListing,
        raw: hist.raw,
        nameIdSource: source,
        error: hist.error || 'histogram без buy',
        attempts: attempts || null,
      };
    }

    return {
      itemNameId,
      highestBuyOrder: hist.highestBuyOrder,
      lowestListing: hist.lowestListing,
      raw: hist.raw,
      nameIdSource: source,
      error: null,
    };
  }

  /** nameid: БД сразу; сеть — один слот очереди Steam. */
  async resolveItemNameId(appId, marketHashName, cookies, community, market = null, session = null) {
    const itemNameId = await getStoredItemNameId(this.db, appId, marketHashName);
    if (itemNameId) {
      return {
        itemNameId,
        steps: [{ step: 'nameid_db', ok: true, itemNameId }],
        playwrightPrices: null,
      };
    }
    return this.scheduleSteam('nameid_resolve', () =>
      this.resolveItemNameIdFromNetwork(appId, marketHashName, cookies, community, market, session)
    );
  }

  /** @deprecated используйте fetchSalesVolumeFromPriceOverview */
  async fetchSalesVolumeFromHistory(appId, marketHashName, sessionOrCookies) {
    return this.fetchSalesVolumeFromPriceOverview(
      appId,
      marketHashName,
      sessionOrCookies
    );
  }

  /**
   * Цены только из ответов Steam. +0.01 ₽ и прибыль — на сервере в dotaStrategy, не здесь.
   */
  async fetchItem(appId, marketHashName, sessionOrCookies = null, ctx = null) {
    const { cookies, session } = normalizeSessionArg(sessionOrCookies);
    const market = session?.market || ctx?.market || null;
    const log = (step, ok, error = null, detail = null) =>
      logFetchStep(this.db, {
        traceId: ctx?.traceId,
        accountId: ctx?.accountId ?? null,
        appId,
        marketHashName,
        step,
        ok,
        error,
        detail,
      });

    const cached = await this.getCached(appId, marketHashName);
    if (cached) {
      if (ctx?.traceId) {
        await log('cache_hit', true, null, {
          priceSource: cached.priceSource,
          highestBuyOrder: cached.highestBuyOrder,
          lowestListing: cached.lowestListing,
        });
      }
      return cached;
    }

    if (ctx?.traceId) await log('fetch_start', true);

    const fetchSteps = [];
    const errors = [];
    let itemNameId = null;
    let lowestListing = null;
    let highestBuyOrder = null;
    let priceSource = null;
    let steamRaw = null;

    const {
      itemNameId: resolvedId,
      steps: nameidSteps,
      playwrightPrices,
    } = await this.resolveItemNameId(
      appId,
      marketHashName,
      cookies,
      session?.community,
      market,
      session
    );
    fetchSteps.push(...nameidSteps);
    itemNameId = isValidItemNameId(resolvedId) ? String(resolvedId).trim() : null;

    if (playwrightPrices && hasCompletePrices(playwrightPrices)) {
      lowestListing = playwrightPrices.lowestListing;
      highestBuyOrder = playwrightPrices.highestBuyOrder;
      steamRaw = { item_nameid: itemNameId, ...playwrightPrices.raw };
      priceSource = 'playwright';
      fetchSteps.push({
        step: 'playwright_histogram',
        ok: true,
        highest_buy_order: highestBuyOrder,
        lowest_listing: lowestListing,
      });
      if (ctx?.traceId) {
        await log('playwright_histogram', true, null, fetchSteps[fetchSteps.length - 1]);
      }
    }
    if (ctx?.traceId) {
      await logProbeToDb(log, nameidSteps, {
        batchStep: 'nameid_probe_batch',
        alwaysSteps: ['playwright_listing'],
      });
    }

    if (
      itemNameId &&
      isValidItemNameId(itemNameId) &&
      !hasCompletePrices({ lowestListing, highestBuyOrder })
    ) {
      try {
        const probe = await this.scheduleSteam('histogram_probe', () =>
          this.probeAllHistogramStrategies(
            appId,
            marketHashName,
            itemNameId,
            cookies,
            session?.community,
            market
          )
        );
        fetchSteps.push(...probe.steps);
        if (ctx?.traceId) {
          await logProbeToDb(log, probe.steps, { batchStep: 'histogram_probe_batch' });
        }
        if (probe.hist && hasCompletePrices(probe.hist)) {
          lowestListing = probe.hist.lowestListing;
          highestBuyOrder = probe.hist.highestBuyOrder;
          const raw = probe.hist.raw || {};
          steamRaw = {
            item_nameid: itemNameId,
            highest_buy_order_cents: raw.highest_buy_order ?? raw.highest_buy_order_cents,
            lowest_sell_order_cents: raw.lowest_sell_order ?? raw.lowest_sell_order_cents,
            ...raw,
          };
          priceSource = probe.winnerId || 'histogram';
        } else {
          errors.push('ордербук: ни одна стратегия не дала buy/sell');
        }
      } catch (err) {
        const msg = formatSteamError(err);
        errors.push(msg);
        fetchSteps.push({ step: 'histogram_probe_batch', ok: false, error: msg });
        if (ctx?.traceId) await log('histogram_probe_batch', false, msg);
      }
    } else {
      errors.push('нет item_nameid');
      fetchSteps.push({
        step: 'histogram_probe_batch',
        ok: false,
        skipped: true,
        reason: 'no item_nameid',
      });
      if (ctx?.traceId) {
        await log('histogram_probe_batch', false, 'no item_nameid', {
          reason: 'сначала нужен nameid (см. nameid_probe_batch.results)',
        });
      }
    }

    if (!hasCompletePrices({ lowestListing, highestBuyOrder })) {
      const msg = `Нет ордербука (${errors.join('; ') || 'нет данных'})`;
      if (ctx?.traceId) await log('fetch_fail', false, msg, { fetchSteps });
      throw new Error(msg);
    }

    let salesPerDay = 0;
    try {
      const vol = await this.scheduleSteam('priceoverview', () =>
        this.fetchSalesVolumeFromPriceOverview(appId, marketHashName, session)
      );
      salesPerDay = vol.salesPerDay;
      fetchSteps.push({
        step: 'priceoverview',
        ok: vol.salesPerDay > 0,
        salesPerDay,
        volumeRaw: vol.volumeRaw,
        via: vol.via,
        error: vol.error,
      });
      steamRaw = { ...steamRaw, priceoverview: vol.raw };
      if (ctx?.traceId) await log('priceoverview', vol.salesPerDay > 0, vol.error, fetchSteps[fetchSteps.length - 1]);
    } catch (err) {
      fetchSteps.push({ step: 'priceoverview', ok: false, error: err.message });
      if (ctx?.traceId) await log('priceoverview', false, err.message);
    }

    const data = {
      appId,
      marketHashName,
      lowestListing,
      highestBuyOrder,
      salesPerDay,
      itemNameId: itemNameId ? String(itemNameId) : null,
      priceSource: priceSource || 'histogram',
      steamRaw: { ...steamRaw, fetchSteps },
      fetchedAt: new Date().toISOString(),
    };

    if (ctx?.traceId) {
      await log('fetch_done', true, null, {
        priceSource: data.priceSource,
        highestBuyOrder: data.highestBuyOrder,
        lowestListing: data.lowestListing,
        itemNameId: data.itemNameId,
      });
    }

    await this.setCache(appId, marketHashName, data);
    return data;
  }

  buildSearchRenderUrl(appId, { start = 0, count = 100, query = '', sortColumn = 'price', sortDir = 'asc' } = {}) {
    return (
      `https://steamcommunity.com/market/search/render/?appid=${appId}` +
      `&norender=1&count=${count}&start=${start}` +
      `&query=${encodeURIComponent(query)}&search_descriptions=0` +
      `&sort_column=${sortColumn}&sort_dir=${sortDir}&currency=5`
    );
  }

  async fetchSearchRenderRaw(appId, cookies = '', { start = 0, count = 100, query = '', sortColumn, sortDir } = {}) {
    const url = this.buildSearchRenderUrl(appId, {
      start,
      count,
      query,
      sortColumn: sortColumn || (query ? 'price' : 'popular'),
      sortDir: sortDir || (query ? 'asc' : 'desc'),
    });
    const { body } = await this.scheduleSteam('search_render', () =>
      httpGet(url, cookies, 0, HTTP_TIMEOUT_MS)
    );
    const data = parseJsonBody(body, 'search');
    if (!data.success) {
      throw new Error(data.error || 'Steam: неуспешный ответ поиска');
    }
    return data;
  }

  async searchMarketRender(appId, query = '', cookies = '', { start = 0, count = 100 } = {}) {
    const data = await this.fetchSearchRenderRaw(appId, cookies, { start, count, query });
    return this.parseSearchRenderPayload(data);
  }

  parseSearchRenderPayload(data) {
    const results = mergeSearchRenderPayload(data).map((r) => ({
      hash_name: r.hash_name,
      name: r.name,
      sell_price: r.sell_price,
      qty: r.qty,
      listing_url: r.listing_url,
    }));
    return { results, totalCount: data.total_count || results.length };
  }

  parseSearchRender(body) {
    const data = parseJsonBody(body, 'search');
    if (!data.success) {
      throw new Error(data.error || 'Steam: неуспешный ответ поиска');
    }
    return this.parseSearchRenderPayload(data);
  }

  async browseMarket(appId, cookies = '', { start = 0, count = 100 } = {}) {
    const data = await this.fetchSearchRenderRaw(appId, cookies, {
      start,
      count,
      query: '',
      sortColumn: 'popular',
      sortDir: 'desc',
    });
    return this.parseSearchRenderPayload(data);
  }

  /** GET страницы лота — в HTML есть #market_commodity_buyrequests (без Playwright). */
  async fetchListingPageHtml(appId, marketHashName, session) {
    const { cookies, session: sess } = normalizeSessionArg(session);
    const { listingUrl } = this.listingUrls(appId, marketHashName);
    const sessionID = sess?.sessionID || null;
    const url = `${listingUrl}?l=russian&currency=5`;

    if (sess?.community) {
      try {
        const body = await withTimeout(
          communityHttpGet(sess.community, url, listingUrl),
          COMMUNITY_TIMEOUT_MS,
          'listing_page'
        );
        return { body: String(body || ''), via: 'community_listing' };
      } catch {
        /* http fallback */
      }
    }

    const { body } = await httpGet(url, cookies, MARKET_HTTP_RETRIES, HTTP_TIMEOUT_MS, sessionID);
    return { body, via: 'http_listing' };
  }

  async fetchListingRenderRaw(appId, marketHashName, session) {
    const { cookies, session: sess } = normalizeSessionArg(session);
    const { listingUrl, renderUrl } = this.listingUrls(appId, marketHashName);
    const sessionID = sess?.sessionID || null;

    if (sess?.community) {
      try {
        const body = await withTimeout(
          communityHttpGet(sess.community, renderUrl, listingUrl, { json: true }),
          COMMUNITY_TIMEOUT_MS,
          'listing_render'
        );
        return { body, via: 'community_render' };
      } catch {
        /* http fallback */
      }
    }

    const { body: raw } = await httpGet(renderUrl, cookies, 1, HTTP_TIMEOUT_MS, sessionID);
    try {
      if (String(raw).trim().startsWith('{')) {
        return { body: JSON.parse(raw), via: 'http_render' };
      }
    } catch {
      /* plain html */
    }
    return { body: raw, via: 'http_render' };
  }

  async fetchHistogramJsonRaw(itemNameId, session, appId, marketHashName) {
    const { cookies, session: sess } = normalizeSessionArg(session);
    const referer = `https://steamcommunity.com/market/listings/${appId}/${encodeURIComponent(marketHashName)}`;
    const url =
      `https://steamcommunity.com/market/itemordershistogram?country=RU&language=russian&currency=5&item_nameid=${itemNameId}&two_factor=0`;

    if (sess?.community) {
      const body = await withTimeout(
        communityHttpGet(sess.community, url, referer, { json: true }),
        COMMUNITY_TIMEOUT_MS,
        'histogram_json'
      );
      return body;
    }

    const { body } = await httpGet(url, cookies, 1, HTTP_TIMEOUT_MS);
    return parseJsonBody(body, 'histogram');
  }

  /**
   * Sell — search/render. Buy — /market/orderbook?q=Load&qp=[appId,"hash_name"] (amtMaxBuyOrder).
   */
  async fetchPricesDomParse(appId, marketHashName, session, searchRow = null) {
    const data = this.buildSimplePriceData(appId, marketHashName, searchRow);

    try {
      const { body, via } = await this.scheduleSteam('orderbook_buy', () =>
        this.fetchOrderbookRaw(appId, marketHashName, session)
      );
      const ob = parseOrderbookResponse(body);

      if (ob.highestBuyCents != null) {
        data.highestBuyOrder = Number(ob.highestBuyCents) / 100;
        data.priceSource = 'search_render_dom+orderbook';
      }

      const buySource = ob.highestBuyCents != null ? 'orderbook_amtMaxBuyOrder' : ob.error || 'orderbook_empty';

      data.steamRaw = {
        ...data.steamRaw,
        buyOrderCount: ob.buyOrderCount,
        sellOrderCount: ob.sellOrderCount,
        amtMaxBuyOrder: ob.amtMaxBuyOrder,
        amtMinSellOrder: ob.amtMinSellOrder,
        orderbookUrl: this.orderbookUrl(appId, marketHashName),
        listingBuyVia: via,
        listingBuySource: buySource,
        orderbookSuccess: body?.success ?? null,
      };
      data._listingBuyOk = data.highestBuyOrder != null;
      data._listingBuyVia = `${via}:${buySource}`;
      if (!data._listingBuyOk) {
        data._listingBuyError = ob.error || 'orderbook без amtMaxBuyOrder';
      }
    } catch (err) {
      data.steamRaw = {
        ...data.steamRaw,
        listingBuyError: formatSteamError(err),
        orderbookUrl: this.orderbookUrl(appId, marketHashName),
      };
      data._listingBuyOk = false;
      data._listingBuyError = formatSteamError(err);
    }

    try {
      const vol = await this.scheduleSteam('priceoverview_liquidity', () =>
        this.fetchSalesVolumeFromPriceOverview(appId, marketHashName, session)
      );
      data.salesPerDay = vol.salesPerDay;
      data.steamRaw = {
        ...data.steamRaw,
        volumeRaw: vol.volumeRaw,
        priceOverviewUrl: vol.priceOverviewUrl,
        liquidityVia: vol.via,
        priceoverviewError: vol.error,
      };
      data._liquidityOk = vol.salesPerDay > 0;
      data._liquidityVia = vol.via;
    } catch (err) {
      data.steamRaw = {
        ...data.steamRaw,
        liquidityError: formatSteamError(err),
        priceOverviewUrl: this.priceOverviewUrl(appId, marketHashName),
      };
      data._liquidityOk = false;
      data._liquidityError = formatSteamError(err);
    }

    return data;
  }

  /** Цена sell «от» с карточки search/render (копейки → рубли). */
  buildSimplePriceData(appId, marketHashName, row) {
    const cents = row?.sell_price;
    const lowestListing = cents != null ? Number(cents) / 100 : null;
    return {
      appId,
      marketHashName,
      lowestListing,
      highestBuyOrder: null,
      salesPerDay: 0,
      priceSource: 'search_render_dom',
      steamRaw: { qty: row?.qty ?? null, listing_url: row?.listing_url ?? null },
      fetchedAt: new Date().toISOString(),
    };
  }

  async searchMarket(community, appId, query = '', start = 0) {
    return this.searchMarketRender(appId, query, '');
  }
}

module.exports = { PriceFetcher, gameToAppId, hasCompletePrices };
