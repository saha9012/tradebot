require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });

const path = require('path');

module.exports = {
  port: Number(process.env.PORT) || 3000,
  dbPath: process.env.DB_PATH || path.join(__dirname, '../../../data/bot.db'),
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
};
