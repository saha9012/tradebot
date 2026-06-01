const { gameToAppId } = require('../providers/steam/priceFetcher');

class MarketScanner {
  constructor(priceFetcher) {
    this.priceFetcher = priceFetcher;
  }

  /**
   * Scan market search results and enrich with price data.
   * Filters by maxItemPrice before full fetch.
   */
  async scanAccount(session, game, config, { maxItems = 15 } = {}) {
    if (!session?.community) {
      return { items: [], error: 'Not logged in — login required for market scan' };
    }

    const appId = gameToAppId(game);
    const cookies = session.cookieHeader || '';

    let searchResults = [];
    try {
      const { results } = await this.priceFetcher.searchMarket(
        session.community,
        appId,
        '',
        0
      );
      searchResults = (results || [])
        .filter((r) => {
          const price = (r.sell_price || 0) / 100;
          return price > 0 && price <= config.maxItemPrice;
        })
        .slice(0, maxItems);
    } catch (err) {
      return { items: [], error: err.message };
    }

    const items = [];
    for (const row of searchResults) {
      try {
        const hashName = row.hash_name || row.name;
        const marketData = await this.priceFetcher.fetchItem(appId, hashName, cookies);
        const buyPrice = marketData.highestBuyOrder
          ? marketData.highestBuyOrder + config.undercutStep
          : (row.sell_price || 0) / 100;

        items.push({
          marketHashName: hashName,
          buyPrice,
          lowestListing: marketData.lowestListing,
          highestBuyOrder: marketData.highestBuyOrder ?? buyPrice - config.undercutStep,
          salesPerDay: marketData.salesPerDay,
          appId,
        });
      } catch (err) {
        items.push({ error: err.message, hash: row.hash_name });
      }
    }

    return { items: items.filter((i) => !i.error) };
  }
}

module.exports = { MarketScanner };
