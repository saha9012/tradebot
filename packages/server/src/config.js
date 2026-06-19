require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });

const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '../../..');

/** .env DB_PATH=./data/bot.db — всегда от корня репо, не от cwd npm workspace. */
function resolveDbPath() {
  const targetDb = process.env.DB_PATH
    ? path.isAbsolute(process.env.DB_PATH)
      ? process.env.DB_PATH
      : path.join(projectRoot, process.env.DB_PATH.replace(/^\.\//, ''))
    : path.join(projectRoot, 'data/bot.db');

  const legacyDb = path.join(__dirname, '../data/bot.db');
  const candidates = [targetDb, legacyDb].filter((p) => {
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  });

  if (candidates.length === 0) return targetDb;

  const pick = candidates.reduce((best, p) => {
    const stat = fs.statSync(p);
    const bestStat = fs.statSync(best);
    if (stat.size > bestStat.size) return p;
    if (stat.size < bestStat.size) return best;
    return stat.mtimeMs > bestStat.mtimeMs ? p : best;
  });

  if (pick !== targetDb) {
    console.warn('[db] Активная база:', pick);
  }
  return pick;
}

module.exports = {
  port: Number(process.env.PORT) || 3000,
  dbPath: resolveDbPath(),
  accountsDir: process.env.ACCOUNTS_DIR || path.join(__dirname, '../../../accounts'),
  adminUser: process.env.ADMIN_USER || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || 'admin',
  rateLimitMinMs: Number(process.env.RATE_LIMIT_MIN_MS) || 1500,
  rateLimitJitterMs: Number(process.env.RATE_LIMIT_JITTER_MS) || 500,
  scanTickMs: Number(process.env.SCAN_TICK_MS) || 20_000,
  sellTickMs: Number(process.env.SELL_TICK_MS) || 45_000,
  /** Сколько предметов за тик (с Playwright лучше 1–2) */
  scanItemsPerTick: Math.min(Math.max(Number(process.env.SCAN_ITEMS_PER_TICK) || 5, 1), 20),
  /** только search/render (DOM data-price), sell с ленты маркета */
  marketPriceMode: (process.env.BOT_MARKET_PRICE_MODE || 'simple').toLowerCase(),
  marketCatalogSyncMs: Number(process.env.BOT_CATALOG_SYNC_MS) || 60 * 60 * 1000,
  /** Очистка аналитики / решений / логов цен (мс), по умолчанию 7 дней */
  analyticsPurgeIntervalMs:
    Number(process.env.BOT_ANALYTICS_PURGE_DAYS) > 0
      ? Number(process.env.BOT_ANALYTICS_PURGE_DAYS) * 24 * 60 * 60 * 1000
      : 7 * 24 * 60 * 60 * 1000,
  /** Сделки старше N дней удаляются; item_id в сделках сохраняется до удаления строки */
  tradesRetentionDays: Math.max(1, Number(process.env.BOT_TRADES_RETENTION_DAYS) || 14),
};
