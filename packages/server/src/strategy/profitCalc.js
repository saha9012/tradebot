/**
 * Чистая выручка продавца с лота (покупатель платит buyerPrice ₽).
 * Упрощённая формула Steam: получишь ≈ цена / (1 + fee%) − 0.01 ₽
 */
function sellerProceeds(buyerPriceRub, feePercent = 15) {
  if (!buyerPriceRub || buyerPriceRub <= 0) return 0;
  const divisor = 1 + feePercent / 100;
  return Math.round((buyerPriceRub / divisor - 0.01) * 100) / 100;
}

function roundMoney(n) {
  return Math.round(n * 100) / 100;
}

module.exports = { sellerProceeds, roundMoney };
