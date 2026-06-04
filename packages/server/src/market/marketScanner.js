const { gameToAppId } = require('../providers/steam/priceFetcher');
const { scanItemsPerTick } = require('../config');
const { logFetchStep } = require('../db/fetchDebugLog');
const { marketListingUrl } = require('../util/marketUrls');
const { evaluate } = require('../strategy/strategyEngine');
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
      return {
        hash_name,
        name: r.name || hash_name,
        sell_price,
        buy_price: r.buy_price ?? null,
        listing_url: r.listing_url ?? null,
      };
    });
  }

  filterByPrice(rows, maxItemPrice) {
    return rows.filter((r) => {
      const price = (r.sell_price || 0) / 100;
      return price > 0 && price <= maxItemPrice;
    });
  }

  async fetchScanPageOnce(session, accountId, game, config) {
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

    return { appId, cursor, totalCount, results };
  }

  async fetchScanPage(session, accountId, game, config, pageSize) {
    let lastErr;
    let payload;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        payload = await this.fetchScanPageOnce(session, accountId, game, config);
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        const msg = err.message || '';
        const retriable = /ECONNRESET|ETIMEDOUT|429|timeout|socket hang up/i.test(msg);
        if (!retriable || attempt >= 2) throw err;
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      }
    }
    if (!payload) throw lastErr || new Error('scan_page failed');

    const { appId, cursor, totalCount, results } = payload;

    const searchResults = this.filterByPrice(this.normalizeRows(results), config.maxItemPrice).slice(
      0,
      pageSize
    );

    const advanceBy = searchResults.length > 0 ? searchResults.length : pageSize;
    const nextCursor = await advanceScanCursor(this.db, accountId, cursor, totalCount, advanceBy);

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
        batchSize: searchResults.length,
      },
    };
  }

  async processSingleItem(session, accountId, game, config, row, traceId, scanInfo) {
    const appId = gameToAppId(game);
    const hashName = row.hash_name || row.name;
    const listingUrl = marketListingUrl(appId, hashName);

    await logFetchStep(this.db, {
      traceId,
      accountId,
      appId,
      marketHashName: hashName,
      step: 'item_selected',
      ok: true,
      detail: { listingUrl, sell_price: row.sell_price },
    });

    let marketData;
    let fetchError = null;

    marketData = await this.priceFetcher.fetchPricesDomParse(appId, hashName, session, row);

    const sellCents = row.sell_price != null ? Number(row.sell_price) : null;
    const okSell =
      marketData.lowestListing != null ||
      (sellCents != null && Number.isFinite(sellCents) && sellCents > 0);
    if (okSell && marketData.lowestListing == null && sellCents != null) {
      marketData.lowestListing = sellCents / 100;
    }
    await logFetchStep(this.db, {
      traceId,
      accountId,
      appId,
      marketHashName: hashName,
      step: 'search_render_price',
      ok: okSell,
      error: okSell ? null : 'нет sell (data-price в search/render)',
      detail: {
        lowestListing: marketData.lowestListing,
        sellCents: row.sell_price,
        priceSource: marketData.priceSource,
      },
    });

    const okBuy = marketData.highestBuyOrder != null;
    await logFetchStep(this.db, {
      traceId,
      accountId,
      appId,
      marketHashName: hashName,
      step: 'listing_page_buy',
      ok: okBuy,
      error: okBuy
        ? null
        : marketData._listingBuyError || 'нет buy (/market/orderbook)',
      detail: {
        highestBuyOrder: marketData.highestBuyOrder,
        buyOrderCount: marketData.steamRaw?.buyOrderCount ?? null,
        amtMaxBuyOrder: marketData.steamRaw?.amtMaxBuyOrder ?? null,
        via: marketData._listingBuyVia ?? marketData.steamRaw?.listingBuyVia ?? null,
        buySource: marketData.steamRaw?.listingBuySource ?? null,
        orderbookUrl: marketData.steamRaw?.orderbookUrl ?? null,
      },
    });

    const okLiq = (marketData.salesPerDay ?? 0) > 0;
    await logFetchStep(this.db, {
      traceId,
      accountId,
      appId,
      marketHashName: hashName,
      step: 'priceoverview',
      ok: okLiq,
      error: okLiq ? null : marketData._liquidityError || 'нет volume в priceoverview',
      detail: {
        salesPerDay: marketData.salesPerDay,
        volumeRaw: marketData.steamRaw?.volumeRaw ?? null,
        via: marketData._liquidityVia ?? marketData.steamRaw?.liquidityVia ?? null,
        priceOverviewUrl: marketData.steamRaw?.priceOverviewUrl ?? null,
      },
    });

    if (!okSell) {
      fetchError = 'нет цены в search/render';
      return {
        hashName,
        listingUrl,
        appId,
        fetchError,
        priceSource: 'нет данных',
        decision: { action: 'skip', reason: 'no_price_data', marketHashName: hashName },
        marketData: null,
      };
    }

    await this.priceFetcher.setCache(appId, hashName, marketData);

    const item = {
      marketHashName: hashName,
      lowestListing: marketData.lowestListing,
      highestBuyOrder: marketData.highestBuyOrder,
      salesPerDay: marketData.salesPerDay,
      priceSource: marketData.priceSource,
      steamRaw: marketData.steamRaw,
      appId,
      listingUrl,
    };

    const decision = evaluate(game, config, item);
    return {
      hashName,
      listingUrl,
      appId,
      item,
      decision,
      marketData,
      fetchError,
    };
  }

  /**
   * Один тик: 1× search/render, до N предметов (цена с маркета + опционально ордербук).
   */
  async processScanBatch(session, accountId, game, config) {
    if (!session?.community) {
      return { ok: false, error: 'Аккаунт не в сети — нужен вход для сканирования маркета' };
    }

    const appId = gameToAppId(game);
    const traceId = `${accountId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const batchSize = scanItemsPerTick;

    let searchResults;
    let scanInfo;
    try {
      ({ searchResults, scanInfo } = await this.fetchScanPage(
        session,
        accountId,
        game,
        config,
        batchSize
      ));
      await logFetchStep(this.db, {
        traceId,
        accountId,
        appId,
        step: 'scan_page',
        ok: true,
        detail: {
          label: scanInfo?.label,
          mode: scanInfo?.mode,
          totalCount: scanInfo?.totalCount,
          found: searchResults.length,
          batchSize,
        },
      });
    } catch (err) {
      await logFetchStep(this.db, {
        traceId,
        accountId,
        appId,
        step: 'scan_page',
        ok: false,
        error: err.message,
      });
      return { ok: false, error: err.message, scanInfo: null, traceId, results: [] };
    }

    if (!searchResults.length) {
      await logFetchStep(this.db, {
        traceId,
        accountId,
        appId,
        step: 'scan_empty',
        ok: false,
        error: `Нет лотов до ${config.maxItemPrice} ₽`,
        detail: scanInfo,
      });
      return {
        ok: false,
        error: `На этой странице нет лотов до ${config.maxItemPrice} ₽ (${scanInfo.label})`,
        scanInfo,
        traceId,
        results: [],
      };
    }

    const results = [];
    for (const row of searchResults) {
      const one = await this.processSingleItem(session, accountId, game, config, row, traceId, scanInfo);
      results.push({ ...one, traceId, scanInfo });
    }

    return { ok: true, scanInfo, traceId, results, appId };
  }

  /** @deprecated — один предмет; используй processScanBatch */
  async processOneItem(session, accountId, game, config) {
    const batch = await this.processScanBatch(session, accountId, game, config);
    if (!batch.ok) return { ok: false, error: batch.error, scanInfo: batch.scanInfo, traceId: batch.traceId };
    const first = batch.results[0];
    if (!first) return { ok: false, error: 'нет результатов', scanInfo: batch.scanInfo, traceId: batch.traceId };
    return { ok: true, ...first, scanInfo: batch.scanInfo, traceId: batch.traceId };
  }

  /** @deprecated — используйте processScanBatch */
  async scanAccount(session, accountId, game, config, { maxItems = 1 } = {}) {
    const batch = await this.processScanBatch(session, accountId, game, config);
    if (!batch.ok && batch.error && !batch.results?.length) {
      return { items: [], error: batch.error, meta: batch.scanInfo };
    }
    const buys = (batch.results || []).filter((r) => r.decision?.action === 'buy' && r.item);
    return {
      items: buys.map((r) => r.item),
      error: null,
      meta: { ...batch.scanInfo, batch: batch.results },
    };
  }
}

module.exports = { MarketScanner };
