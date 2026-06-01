require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });

const path = require('path');

module.exports = {
  port: Number(process.env.PORT) || 3000,
  dbPath: process.env.DB_PATH || path.join(__dirname, '../../../data/bot.db'),
  accountsDir: process.env.ACCOUNTS_DIR || path.join(__dirname, '../../../accounts'),
  adminUser: process.env.ADMIN_USER || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || 'admin',
  rateLimitMinMs: Number(process.env.RATE_LIMIT_MIN_MS) || 4000,
  rateLimitJitterMs: Number(process.env.RATE_LIMIT_JITTER_MS) || 2000,
};
