const https = require('https');
const { run, get } = require('../../db/database');
const { APP_IDS } = require('../../strategy/defaults');

const CACHE_TTL_MS = 10 * 60 * 1000;

function httpGet(url, cookies = '') {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          Cookie: cookies,
          Referer: 'https://steamcommunity.com/market/',
        },
      },
      (res) => {
        let body = '';
        res.on('data', (c) => { body += c; });
        res.on('end', () => {
          if (res.statusCode === 429) {
            reject(new Error('429 Too Many Requests'));
            return;
          }
          resolve({ statusCode: res.statusCode, body });
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('Request timeout')));
  });
}

function gameToAppId(game) {
  return APP_IDS[game] || APP_IDS.dota;
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
    return JSON.parse(row.data_json);
  }

  async setCache(appId, marketHashName, data) {
    await run(
      this.db,
      `INSERT OR REPLACE INTO price_cache (app_id, market_hash_name, data_json, updated_at)
       VALUES (?, ?, ?, datetime('now'))`,
      [appId, marketHashName, JSON.stringify(data)]
    );
  }

  async fetchItem(appId, marketHashName, cookies = '') {
    const cached = await this.getCached(appId, marketHashName);
    if (cached) return cached;

    return this.rateLimiter.schedule(async () => {
      const encoded = encodeURIComponent(marketHashName);
      const historyUrl =
        `https://steamcommunity.com/market/pricehistory/?appid=${appId}&market_hash_name=${encoded}&currency=5`;

      const { body: historyBody } = await httpGet(historyUrl, cookies);
      const history = JSON.parse(historyBody);

      let salesPerDay = 0;
      if (history.success && history.prices?.length) {
        const dayAgo = Date.now() - 86400000;
        salesPerDay = history.prices.filter((p) => {
          const d = new Date(p[0]);
          return d.getTime() > dayAgo;
        }).length;
      }

      const listingUrl =
        `https://steamcommunity.com/market/listings/${appId}/${encoded}/render/?start=0&count=1&currency=5&language=english&format=json`;

      const { body: listingBody } = await this.rateLimiter.schedule(() =>
        httpGet(listingUrl, cookies)
      );

      const listing = JSON.parse(listingBody);
      let lowestListing = null;
      let highestBuyOrder = null;
      let itemNameId = null;

      if (listing.success) {
        if (listing.listinginfo) {
          const first = Object.values(listing.listinginfo)[0];
          if (first?.converted_price != null) {
            lowestListing = (first.converted_price + (first.converted_fee || 0)) / 100;
          }
        }
        if (listing.assets?.length) {
          // fallback parse from HTML in listingdata
        }
        const nameIdMatch = listingBody.match(/Market_LoadOrderSpread\(\s*(\d+)\s*\)/);
        if (nameIdMatch) itemNameId = nameIdMatch[1];
      }

      if (itemNameId) {
        const histUrl =
          `https://steamcommunity.com/market/itemordershistogram?country=RU&language=english&currency=5&item_nameid=${itemNameId}&two_factor=0`;
        const { body: orderBody } = await this.rateLimiter.schedule(() =>
          httpGet(histUrl, cookies)
        );
        const orders = JSON.parse(orderBody);
        if (orders.success) {
          if (orders.lowest_sell_order) {
            lowestListing = Number(orders.lowest_sell_order) / 100;
          }
          if (orders.highest_buy_order) {
            highestBuyOrder = Number(orders.highest_buy_order) / 100;
          }
        }
      }

      const data = {
        appId,
        marketHashName,
        lowestListing,
        highestBuyOrder,
        salesPerDay,
        itemNameId,
        fetchedAt: new Date().toISOString(),
      };

      await this.setCache(appId, marketHashName, data);
      return data;
    });
  }

  async searchMarket(community, appId, query = '', start = 0) {
    return new Promise((resolve, reject) => {
      community.marketSearch(
        { appid: appId, query, searchDescriptions: false, noRender: true, count: 100, start },
        (err, results, totalCount) => {
          if (err) reject(err);
          else resolve({ results: results || [], totalCount: totalCount || 0 });
        }
      );
    });
  }
}

module.exports = { PriceFetcher, gameToAppId };
