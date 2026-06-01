// bot.js
const db = require('./database');
const mp = require('./marketplace');

async function run() {
  db.initDB();
  console.log('[BOT] DB initialized');
  try {
    await mp.checkFavoritesLoop();
  } catch (err) {
    console.error('[BOT] Fatal error:', err);
  }
}

run();
