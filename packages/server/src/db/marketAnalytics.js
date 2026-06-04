const { run, all, get } = require('./database');

/** Снимок данных Steam: цены и ликвидность (без решения бота). */
async function saveMarketSnapshot(db, row) {
  const result = await run(
    db,
    `INSERT INTO market_analytics (
      account_id, game, app_id, market_hash_name,
      highest_buy_order, lowest_listing, sales_per_day,
      listing_url, steam_raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.accountId || null,
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

async function countMarketSnapshots(db, accountId = null) {
  if (accountId) {
    const row = await get(
      db,
      'SELECT COUNT(*) AS c FROM market_analytics WHERE account_id = ?',
      [accountId]
    );
    return row?.c ?? 0;
  }
  const row = await get(db, 'SELECT COUNT(*) AS c FROM market_analytics');
  return row?.c ?? 0;
}

module.exports = { saveMarketSnapshot, listMarketSnapshots, countMarketSnapshots };
