const { run, all, get } = require('./database');
const { getItemId } = require('../util/itemId');

function accountKey(accountId) {
  return accountId || '';
}

async function upsertItemSnapshot(db, row) {
  const itemId = row.itemId || getItemId(row.marketHashName);
  if (!itemId) throw new Error('itemId: пустое название предмета');

  const acc = accountKey(row.accountId);
  await run(
    db,
    `INSERT INTO market_item_snapshots (
      account_id, item_id, game, app_id, market_hash_name,
      highest_buy_order, lowest_listing, sales_per_day,
      listing_url, steam_raw_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(account_id, item_id) DO UPDATE SET
      game = excluded.game,
      app_id = excluded.app_id,
      market_hash_name = excluded.market_hash_name,
      highest_buy_order = excluded.highest_buy_order,
      lowest_listing = excluded.lowest_listing,
      sales_per_day = excluded.sales_per_day,
      listing_url = excluded.listing_url,
      steam_raw_json = excluded.steam_raw_json,
      updated_at = datetime('now')`,
    [
      acc,
      itemId,
      row.game,
      row.appId,
      row.marketHashName,
      row.highestBuyOrder ?? null,
      row.lowestListing ?? null,
      row.salesPerDay ?? null,
      row.listingUrl || null,
      row.steamRaw ? JSON.stringify(row.steamRaw) : null,
    ]
  );

  await appendPriceLog(db, {
    accountId: acc,
    itemId,
    appId: row.appId,
    marketHashName: row.marketHashName,
    highestBuyOrder: row.highestBuyOrder,
    lowestListing: row.lowestListing,
    salesPerDay: row.salesPerDay,
  });

  return itemId;
}

async function appendPriceLog(db, row) {
  await run(
    db,
    `INSERT INTO item_price_log (
      account_id, item_id, app_id, market_hash_name,
      highest_buy_order, lowest_listing, sales_per_day
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      row.accountId || '',
      row.itemId,
      row.appId ?? null,
      row.marketHashName || null,
      row.highestBuyOrder ?? null,
      row.lowestListing ?? null,
      row.salesPerDay ?? null,
    ]
  );
}

async function upsertItemDecision(db, row) {
  const itemId = row.itemId || getItemId(row.marketHashName);
  if (!itemId) throw new Error('itemId: пустое название предмета');

  const acc = accountKey(row.accountId);
  await run(
    db,
    `INSERT INTO market_item_decisions (
      account_id, item_id, game, app_id, market_hash_name,
      highest_buy_order, lowest_listing, buy_order_price, sell_listing_price,
      profit, profit_percent, decision, skip_reason, listing_url, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(account_id, item_id) DO UPDATE SET
      game = excluded.game,
      app_id = excluded.app_id,
      market_hash_name = excluded.market_hash_name,
      highest_buy_order = excluded.highest_buy_order,
      lowest_listing = excluded.lowest_listing,
      buy_order_price = excluded.buy_order_price,
      sell_listing_price = excluded.sell_listing_price,
      profit = excluded.profit,
      profit_percent = excluded.profit_percent,
      decision = excluded.decision,
      skip_reason = excluded.skip_reason,
      listing_url = excluded.listing_url,
      updated_at = datetime('now')`,
    [
      acc,
      itemId,
      row.game,
      row.appId,
      row.marketHashName,
      row.highestBuyOrder ?? null,
      row.lowestListing ?? null,
      row.buyOrderPrice ?? null,
      row.sellListingPrice ?? null,
      row.profit ?? null,
      row.profitPercent ?? null,
      row.decision || null,
      row.skipReason || null,
      row.listingUrl || null,
    ]
  );
  return itemId;
}

async function listItemSnapshots(db, { limit = 150, accountId } = {}) {
  const cap = Math.min(Math.max(Number(limit) || 150, 1), 500);
  const sql = accountId
    ? `SELECT * FROM market_item_snapshots WHERE account_id = ? ORDER BY updated_at DESC LIMIT ?`
    : `SELECT * FROM market_item_snapshots ORDER BY updated_at DESC LIMIT ?`;
  const params = accountId ? [accountId, cap] : [cap];
  return all(db, sql, params);
}

async function listItemDecisions(db, { limit = 150, accountId } = {}) {
  const cap = Math.min(Math.max(Number(limit) || 150, 1), 500);
  const sql = accountId
    ? `SELECT * FROM market_item_decisions WHERE account_id = ? ORDER BY updated_at DESC LIMIT ?`
    : `SELECT * FROM market_item_decisions ORDER BY updated_at DESC LIMIT ?`;
  const params = accountId ? [accountId, cap] : [cap];
  return all(db, sql, params);
}

async function countItemSnapshots(db, accountId = null) {
  if (accountId) {
    const row = await get(
      db,
      'SELECT COUNT(*) AS c FROM market_item_snapshots WHERE account_id = ?',
      [accountId]
    );
    return row?.c ?? 0;
  }
  const row = await get(db, 'SELECT COUNT(*) AS c FROM market_item_snapshots');
  return row?.c ?? 0;
}

async function countItemDecisions(db, accountId = null) {
  if (accountId) {
    const row = await get(
      db,
      'SELECT COUNT(*) AS c FROM market_item_decisions WHERE account_id = ?',
      [accountId]
    );
    return row?.c ?? 0;
  }
  const row = await get(db, 'SELECT COUNT(*) AS c FROM market_item_decisions');
  return row?.c ?? 0;
}

async function countPriceLogs(db) {
  const row = await get(db, 'SELECT COUNT(*) AS c FROM item_price_log');
  return row?.c ?? 0;
}

async function clearItemMarketData(db) {
  await run(db, 'DELETE FROM market_item_snapshots');
  await run(db, 'DELETE FROM market_item_decisions');
  await run(db, 'DELETE FROM item_price_log');
}

module.exports = {
  upsertItemSnapshot,
  upsertItemDecision,
  appendPriceLog,
  listItemSnapshots,
  listItemDecisions,
  countItemSnapshots,
  countItemDecisions,
  countPriceLogs,
  clearItemMarketData,
};
