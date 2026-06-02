const { gameToAppId } = require('../providers/steam/priceFetcher');
const {
  loadScanCursor,
  advanceScanCursor,
  describeCursor,
  DOTA_SEARCH_QUERIES,
} = require('./scanCursor');

class MarketScanner {
  constructor(priceFetcher, db) {
    this.priceFetcher = priceFetcher;
    this.db = db;
  }

  normalizeRows(results) {
    return (results || []).map((r) => {
      const hash_name = r.hash_name || r.market_hash_name || r.name;
      let sell_price = r.sell_price;
      if (sell_price == null && r.price != null) sell_price = r.price;
      return { hash_name, name: r.name || hash_name, sell_price };
    });
  }

  filterByPrice(rows, maxItemPrice) {
    return rows.filter((r) => {
      const price = (r.sell_price || 0) / 100;
      return price > 0 && price <= maxItemPrice;
    });
  }

  /**
   * Один источник и смещение за тик — каждый цикл другая «страница» маркета.
   */
  async fetchScanPage(session, accountId, game, config, pageSize) {
    const appId = gameToAppId(game);
    const cookies = session.cookieHeader || '';
    const cursor = await loadScanCursor(this.db, accountId);

    let totalCount = 0;
    let results = [];

    if (game === 'dota') {
      if (cursor.mode === 'browse') {
        const res = await this.priceFetcher.browseMarket(appId, cookies, {
          start: cursor.start,
          count: 100,
        });
        results = res.results;
        totalCount = res.totalCount;
      } else {
        const q = DOTA_SEARCH_QUERIES[cursor.queryIdx % DOTA_SEARCH_QUERIES.length];
        const res = await this.priceFetcher.searchMarketRender(appId, q, cookies, {
          start: cursor.start,
          count: 100,
        });
        results = res.results;
        totalCount = res.totalCount;
      }
    } else {
      const res = await this.priceFetcher.searchMarketRender(appId, '', cookies, {
        start: cursor.start,
        count: 100,
      });
      results = res.results;
      totalCount = res.totalCount;
    }

    const searchResults = this.filterByPrice(this.normalizeRows(results), config.maxItemPrice).slice(
      0,
      pageSize
    );

    const nextCursor = await advanceScanCursor(this.db, accountId, cursor, totalCount, pageSize);

    return {
      searchResults,
      scanInfo: {
        mode: cursor.mode,
        start: cursor.start,
        query:
          cursor.mode === 'query'
            ? DOTA_SEARCH_QUERIES[cursor.queryIdx % DOTA_SEARCH_QUERIES.length]
            : null,
        label: describeCursor(cursor),
        nextLabel: describeCursor(nextCursor),
        totalCount,
      },
    };
  }

  async scanAccount(session, accountId, game, config, { maxItems = 10 } = {}) {
    if (!session?.community) {
      return { items: [], error: 'Аккаунт не в сети — нужен вход для сканирования маркета' };
    }

    const appId = gameToAppId(game);
    const cookies = session.cookieHeader || '';
    const pageSize = maxItems;

    let searchResults;
    let scanInfo;
    try {
      ({ searchResults, scanInfo } = await this.fetchScanPage(
        session,
        accountId,
        game,
        config,
        pageSize
      ));
    } catch (err) {
      return { items: [], error: err.message };
    }

    if (!searchResults.length) {
      return {
        items: [],
        error: `На этой странице нет лотов до ${config.maxItemPrice} ₽ (${scanInfo.label})`,
        meta: scanInfo,
      };
    }

    const items = [];
    let fetchFailed = 0;
    let firstFetchError = null;
    for (const row of searchResults) {
      const hashName = row.hash_name || row.name;
      try {
        const hintLowestRub = row.sell_price > 0 ? row.sell_price / 100 : undefined;
        const marketData = await this.priceFetcher.fetchItem(appId, hashName, session, {
          hintLowestRub,
        });
        if (marketData.highestBuyOrder == null || marketData.lowestListing == null) {
          fetchFailed += 1;
          continue;
        }

        items.push({
          marketHashName: hashName,
          buyPrice: marketData.highestBuyOrder + config.undercutStep,
          lowestListing: marketData.lowestListing,
          highestBuyOrder: marketData.highestBuyOrder,
          salesPerDay: marketData.salesPerDay,
          salesPerWeek: marketData.salesPerWeek,
          appId,
        });
      } catch (err) {
        fetchFailed += 1;
        if (!firstFetchError) firstFetchError = err.message;
      }
    }

    if (!items.length) {
      const detail = firstFetchError ? ` — ${firstFetchError}` : '';
      return {
        items: [],
        error: `Найдено ${searchResults.length} лотов, но не удалось загрузить цены (${fetchFailed} ошибок)${detail}`,
        meta: { ...scanInfo, fetchFailed, firstFetchError },
      };
    }

    return {
      items,
      meta: {
        ...scanInfo,
        enriched: items.length,
        names: items.map((i) => i.marketHashName),
      },
    };
  }
}

module.exports = { MarketScanner };
