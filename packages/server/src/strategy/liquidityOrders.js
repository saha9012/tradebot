/**
 * Объём buy-ордера по ликвидности (продажи/сутки):
 * liquidityMin <= L < liquidityMax → orderQtyMin
 * L >= liquidityMax → orderQtyMax
 */
function resolveBuyOrderQuantity(config, salesPerDay) {
  const liq = Number(salesPerDay) || 0;
  const tierMin = Number(config.liquidityMin) || 0;
  const tierMax = Number(config.liquidityMax) || 0;
  const qtyLow = Math.max(1, Math.floor(Number(config.orderQtyMin) || 1));
  const qtyHigh = Math.max(1, Math.floor(Number(config.orderQtyMax) || 1));

  if (tierMin <= 0 || tierMax <= 0 || tierMax < tierMin) return 0;
  if (liq < tierMin) return 0;
  if (liq >= tierMax) return qtyHigh;
  return qtyLow;
}

module.exports = { resolveBuyOrderQuantity };
