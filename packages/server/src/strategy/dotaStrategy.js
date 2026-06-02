const { sellerProceeds, roundMoney } = require('./profitCalc');

function evaluateBuy(config, item) {
  const { lowestListing, salesPerDay, salesPerWeek, marketHashName, highestBuyOrder } = item;

  if (highestBuyOrder == null || lowestListing == null) {
    return skip('no_price_data', marketHashName, { highestBuyOrder, lowestListing });
  }

  const buyPrice = roundMoney(highestBuyOrder + config.undercutStep);
  const netSell = sellerProceeds(lowestListing, config.feePercent);
  const profit = roundMoney(netSell - buyPrice);
  const profitPercent = buyPrice > 0 ? roundMoney((profit / buyPrice) * 100) : 0;

  if (buyPrice > config.maxItemPrice) return skip('max_item_price', marketHashName, { buyPrice });
  if (buyPrice >= config.highTierPriceFrom && profitPercent > config.maxProfitPercentHighTier) {
    return skip('high_tier_profit_cap', marketHashName, { profitPercent, profit, buyPrice, netSell });
  }
  if (profitPercent > config.maxProfitPercent) {
    return skip('scam_skip', marketHashName, { profitPercent, profit, buyPrice, netSell });
  }
  if (profit <= config.minProfitAbsolute) {
    return skip('min_profit', marketHashName, {
      profit,
      buyPrice,
      lowestListing,
      netSell,
      feePercent: config.feePercent,
    });
  }
  if (salesPerDay < config.minLiquidity) return skip('low_liquidity', marketHashName, { salesPerDay });
  const minWeek = config.minLiquidityWeek ?? 150;
  if ((salesPerWeek ?? 0) < minWeek) return skip('low_liquidity_week', marketHashName, { salesPerWeek, minWeek });

  const sellListingPrice = roundMoney(Math.max(0.03, lowestListing - config.undercutStep));

  return {
    action: 'buy',
    buyOrderPrice: buyPrice,
    sellListingPrice,
    profit,
    profitPercent,
    reason: 'passes_all_filters',
    marketHashName,
    meta: { buyPrice, lowestListing, netSell },
  };
}

function skip(reason, marketHashName, meta = {}) {
  return { action: 'skip', reason, marketHashName, meta };
}

module.exports = { evaluateBuy };
