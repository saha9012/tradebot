const { run, all, get } = require('./database');

async function saveMarketDecision(db, row) {
  const result = await run(
    db,
    `INSERT INTO market_decisions (
      account_id, game, app_id, market_hash_name, analytics_id,
      highest_buy_order, lowest_listing, buy_order_price, sell_listing_price,
      profit, profit_percent, decision, skip_reason, listing_url
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.accountId || null,
      row.game,
      row.appId,
      row.marketHashName,
      row.analyticsId ?? null,
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
  return result.lastID;
}

async function listMarketDecisions(db, { limit = 100, accountId } = {}) {
  const cap = Math.min(Math.max(Number(limit) || 100, 1), 500);
  if (accountId) {
    return all(
      db,
      `SELECT * FROM market_decisions WHERE account_id = ? ORDER BY id DESC LIMIT ?`,
      [accountId, cap]
    );
  }
  return all(db, `SELECT * FROM market_decisions ORDER BY id DESC LIMIT ?`, [cap]);
}

async function countMarketDecisions(db, accountId = null) {
  if (accountId) {
    const row = await get(
      db,
      'SELECT COUNT(*) AS c FROM market_decisions WHERE account_id = ?',
      [accountId]
    );
    return row?.c ?? 0;
  }
  const row = await get(db, 'SELECT COUNT(*) AS c FROM market_decisions');
  return row?.c ?? 0;
}

module.exports = { saveMarketDecision, listMarketDecisions, countMarketDecisions };
