const { run, all } = require('./database');

async function saveMarketSnapshot(db, row) {
  const result = await run(
    db,
    `INSERT INTO market_analytics (
      account_id, game, app_id, market_hash_name, item_name_id,
      highest_buy_order, lowest_listing, buy_order_price, sell_listing_price,
      profit, profit_percent, sales_per_day, sales_per_week,
      price_source, decision, skip_reason, listing_url, steam_raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.accountId || null,
      row.game,
      row.appId,
      row.marketHashName,
      row.itemNameId || null,
      row.highestBuyOrder ?? null,
      row.lowestListing ?? null,
      row.buyOrderPrice ?? null,
      row.sellListingPrice ?? null,
      row.profit ?? null,
      row.profitPercent ?? null,
      row.salesPerDay ?? null,
      row.salesPerWeek ?? null,
      row.priceSource || null,
      row.decision || null,
      row.skipReason || null,
      row.listingUrl || null,
      row.steamRaw ? JSON.stringify(row.steamRaw) : null,
    ]
  );
  return result.lastID;
}

async function listMarketSnapshots(db, { limit = 100, accountId } = {}) {
  const cap = Math.min(Math.max(Number(limit) || 100, 1), 500);
  if (accountId) {
    return all(
      db,
      `SELECT * FROM market_analytics WHERE account_id = ? ORDER BY id DESC LIMIT ?`,
      [accountId, cap]
    );
  }
  return all(db, `SELECT * FROM market_analytics ORDER BY id DESC LIMIT ?`, [cap]);
}

module.exports = { saveMarketSnapshot, listMarketSnapshots };
