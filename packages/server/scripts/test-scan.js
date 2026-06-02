/**
 * Быстрая проверка поиска Dota без логина (публичный API).
 * node scripts/test-scan.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const { openDb, initDatabase } = require('../src/db/database');
const { PriceFetcher } = require('../src/providers/steam/priceFetcher');
const { RateLimiter } = require('../src/jobs/rateLimiter');
const { MarketScanner } = require('../src/market/marketScanner');
const { mergeStrategyConfig } = require('../src/strategy/defaults');

async function main() {
  const db = await initDatabase();
  const pf = new PriceFetcher(db, new RateLimiter({ minDelayMs: 300, jitterMs: 100 }));
  const scanner = new MarketScanner(pf, db);
  const config = mergeStrategyConfig('dota', {});

  const session = { community: {}, cookieHeader: '' };
  const { items, error, meta } = await scanner.scanAccount(session, 'test', 'dota', config, { maxItems: 3 });
  console.log('error:', error || '—');
  console.log('meta:', meta);
  console.log('items:', items.length, items.map((i) => i.marketHashName).join(', '));
  process.exit(items.length ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
