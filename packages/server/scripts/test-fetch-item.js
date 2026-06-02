const { initDatabase } = require('../src/db/database');
const { PriceFetcher } = require('../src/providers/steam/priceFetcher');
const { RateLimiter } = require('../src/jobs/rateLimiter');

const item = process.argv[2] || 'Stoneclaw Scavengers Dire Towers';

(async () => {
  const db = await initDatabase();
  const pf = new PriceFetcher(db, new RateLimiter({ minDelayMs: 300, jitterMs: 50 }));
  try {
    const d = await pf.fetchItem(570, item, null);
    console.log('OK', {
      lowest: d.lowestListing,
      buy: d.highestBuyOrder,
      itemNameId: d.itemNameId,
    });
  } catch (e) {
    console.error('FAIL', e.message);
    process.exitCode = 1;
  }
})();
