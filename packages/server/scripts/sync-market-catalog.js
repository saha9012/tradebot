/**
 * Разовый или cron-запуск: обновить каталог цен с маркета (DOM из search/render).
 *
 *   node packages/server/scripts/sync-market-catalog.js
 *   node packages/server/scripts/sync-market-catalog.js --game=dota --query=arcana
 *
 * Нужен запущенный сервер с активной сессией account-1 ИЛИ переменные STEAM_* в .env для логина.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });

const { initDatabase } = require('../src/db/database');
const { AccountPool } = require('../src/steam/accountPool');
const { PriceFetcher } = require('../src/providers/steam/priceFetcher');
const { RateLimiter } = require('../src/jobs/rateLimiter');
const { syncGameCatalog } = require('../src/market/marketCatalogSync');
const { rateLimitMinMs, rateLimitJitterMs } = require('../src/config');

function arg(name, fallback = '') {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
}

async function main() {
  const game = arg('game', 'dota');
  const query = arg('query', '');
  const accountId = arg('account', 'account-1');

  const db = await initDatabase();
  const pool = new AccountPool(db);
  const rateLimiter = new RateLimiter({
    minDelayMs: rateLimitMinMs,
    jitterMs: rateLimitJitterMs,
  });
  const priceFetcher = new PriceFetcher(db, rateLimiter);

  let session = pool.getSession(accountId);
  if (!session?.cookieHeader) {
    const row = await require('../src/db/database').get(
      db,
      'SELECT credentials_env FROM accounts WHERE id = ?',
      [accountId]
    );
    if (!row?.credentials_env) {
      console.error('Нет сессии. Войди в UI или задай credentials в accounts.');
      process.exit(1);
    }
    await pool.login(accountId, row.credentials_env);
    session = pool.getSession(accountId);
  }

  console.log(`Синхронизация каталога: game=${game} query="${query}"...`);
  const result = await syncGameCatalog(priceFetcher, db, game, session, { query });
  console.log('Готово:', result);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
