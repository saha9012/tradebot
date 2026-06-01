function evaluateBuy(config, item) {
  const { buyPrice, lowestListing, salesPerDay, marketHashName, highestBuyOrder } = item;
  const fee = buyPrice * (config.feePercent / 100);
  const profit = lowestListing - (buyPrice + fee);
  const profitPercent = buyPrice > 0 ? (profit / (buyPrice + fee)) * 100 : 0;

  if (buyPrice > config.maxItemPrice) return skip('max_item_price', marketHashName, { buyPrice });
  if (buyPrice >= config.highTierPriceFrom && profitPercent > config.maxProfitPercentHighTier)
    return skip('high_tier_profit_cap', marketHashName, { profitPercent });
  if (profitPercent > config.maxProfitPercent) return skip('scam_skip', marketHashName, { profitPercent });
  if (profit <= config.minProfitAbsolute) return skip('min_profit', marketHashName, { profit });
  if (salesPerDay < config.minLiquidity) return skip('low_liquidity', marketHashName, { salesPerDay });

  return {
    action: 'buy',
    buyOrderPrice: roundMoney(highestBuyOrder + config.undercutStep),
    sellListingPrice: roundMoney(lowestListing - config.undercutStep),
    profit, profitPercent, reason: 'passes_all_filters', marketHashName,
  };
}

function skip(reason, marketHashName, meta = {}) {
  return { action: 'skip', reason, marketHashName, meta };
}

function roundMoney(n) { return Math.round(n * 100) / 100; }

module.exports = { evaluateBuy };
