const { all, get, run } = require('./database');
const { sellerProceeds, roundMoney } = require('../strategy/profitCalc');
const { BASE } = require('../strategy/defaults');

/** Новый предмет в инвентаре — полная строка; повтор — только sell_price и updated_at. */
async function upsertSalePrice(db, row) {
  await run(
    db,
    `INSERT INTO market_sales (
      account_id, item_id, asset_id, game, app_id, market_hash_name, sell_price, listing_url, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(account_id, asset_id) DO UPDATE SET
      sell_price = excluded.sell_price,
      updated_at = datetime('now')`,
    [
      row.accountId,
      row.itemId,
      String(row.assetId),
      row.game,
      row.appId,
      row.marketHashName,
      row.sellPrice,
      row.listingUrl || null,
    ]
  );
}

async function pruneSalesNotInAssets(db, accountId, assetIds) {
  if (!assetIds.length) {
    await run(db, 'DELETE FROM market_sales WHERE account_id = ?', [accountId]);
    return;
  }
  const placeholders = assetIds.map(() => '?').join(',');
  await run(
    db,
    `DELETE FROM market_sales WHERE account_id = ? AND asset_id NOT IN (${placeholders})`,
    [accountId, ...assetIds]
  );
}

async function countSales(db, accountId = null) {
  if (accountId) {
    const row = await get(db, 'SELECT COUNT(*) AS c FROM market_sales WHERE account_id = ?', [
      accountId,
    ]);
    return row?.c ?? 0;
  }
  const row = await get(db, 'SELECT COUNT(*) AS c FROM market_sales');
  return row?.c ?? 0;
}

async function listSales(db, { limit = 20, offset = 0, accountId } = {}) {
  const cap = Math.min(Math.max(Number(limit) || 20, 1), 500);
  const off = Math.max(Number(offset) || 0, 0);
  const sql = accountId
    ? `SELECT * FROM market_sales WHERE account_id = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?`
    : `SELECT * FROM market_sales ORDER BY updated_at DESC LIMIT ? OFFSET ?`;
  const params = accountId ? [accountId, cap, off] : [cap, off];
  return all(db, sql, params);
}

function mapSaleRow(r) {
  return {
    id: r.id,
    item_id: r.item_id,
    market_hash_name: r.market_hash_name,
    account_id: r.account_id,
    sell_price: r.sell_price,
    listing_url: r.listing_url,
    updated_at: r.updated_at,
  };
}

function computeProfit(buyPrice, sellPrice, feePercent = BASE.feePercent) {
  if (buyPrice == null || sellPrice == null || buyPrice <= 0 || sellPrice <= 0) {
    return { profit: null, profit_percent: null };
  }
  const netSell = sellerProceeds(sellPrice, feePercent);
  const profit = roundMoney(netSell - buyPrice);
  const profit_percent = roundMoney((profit / buyPrice) * 100);
  return { profit, profit_percent };
}

const COMPARE_BASE_SQL = `
  FROM market_sales s
  LEFT JOIN trades b ON b.id = (
    SELECT id FROM trades
    WHERE account_id = s.account_id AND item_id = s.item_id AND action = 'buy'
    ORDER BY id DESC LIMIT 1
  )
  LEFT JOIN market_item_decisions d
    ON d.account_id = s.account_id AND d.item_id = s.item_id
`;

async function countCompare(db, accountId = null) {
  const where = accountId ? 'WHERE s.account_id = ?' : '';
  const params = accountId ? [accountId] : [];
  const row = await get(db, `SELECT COUNT(*) AS c ${COMPARE_BASE_SQL} ${where}`, params);
  return row?.c ?? 0;
}

async function listCompare(db, { limit = 20, offset = 0, accountId } = {}) {
  const cap = Math.min(Math.max(Number(limit) || 20, 1), 500);
  const off = Math.max(Number(offset) || 0, 0);
  const where = accountId ? 'WHERE s.account_id = ?' : '';
  const params = accountId ? [accountId, cap, off] : [cap, off];

  const rows = await all(
    db,
    `SELECT
      s.id,
      s.item_id,
      s.market_hash_name,
      s.account_id,
      s.sell_price,
      s.listing_url,
      s.updated_at,
      COALESCE(b.price, d.buy_order_price) AS buy_order_price
    ${COMPARE_BASE_SQL}
    ${where}
    ORDER BY s.updated_at DESC
    LIMIT ? OFFSET ?`,
    params
  );

  return rows.map((r) => {
    const { profit, profit_percent } = computeProfit(r.buy_order_price, r.sell_price);
    return {
      id: r.id,
      item_id: r.item_id,
      market_hash_name: r.market_hash_name,
      account_id: r.account_id,
      buy_order_price: r.buy_order_price,
      sell_price: r.sell_price,
      profit,
      profit_percent,
      updated_at: r.updated_at,
      listing_url: r.listing_url,
    };
  });
}

async function getCompareSummary(db) {
  const rows = await all(
    db,
    `SELECT
      COALESCE(b.price, d.buy_order_price) AS buy_order_price,
      s.sell_price
    ${COMPARE_BASE_SQL}`
  );

  let totalProfit = 0;
  let withProfit = 0;
  for (const r of rows) {
    const { profit } = computeProfit(r.buy_order_price, r.sell_price);
    if (profit != null) {
      totalProfit += profit;
      withProfit += 1;
    }
  }

  const salesCount = await countSales(db);
  return {
    salesCount,
    compareCount: rows.length,
    projectedProfit: roundMoney(totalProfit),
    avgProfit: withProfit > 0 ? roundMoney(totalProfit / withProfit) : 0,
  };
}

module.exports = {
  upsertSalePrice,
  pruneSalesNotInAssets,
  countSales,
  listSales,
  mapSaleRow,
  countCompare,
  listCompare,
  getCompareSummary,
  computeProfit,
};
