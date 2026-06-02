const { initDatabase } = require('../src/db/database');
const { PriceFetcher } = require('../src/providers/steam/priceFetcher');
const { RateLimiter } = require('../src/jobs/rateLimiter');

(async () => {
  process.stdout.write('start\n');
  const db = await initDatabase();
  process.stdout.write('db ok\n');
  const pf = new PriceFetcher(db, new RateLimiter({ minDelayMs: 200, jitterMs: 50 }));
  try {
    process.stdout.write('fetching...\n');
    const d = await pf.fetchItem(570, 'Dead Reckoning Chest', '');
    process.stdout.write(`done lowest=${d?.lowestListing} week=${d?.salesPerWeek}\n`);
  } catch (e) {
    process.stderr.write(`FAIL ${e.message}\n${e.stack}\n`);
    process.exitCode = 1;
  }
})().catch((e) => {
  process.stderr.write(`FATAL ${e.message}\n`);
  process.exit(1);
});
