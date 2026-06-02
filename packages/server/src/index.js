const express = require('express');
const cors = require('cors');
const path = require('path');
const { port } = require('./config');
const { initDatabase } = require('./db/database');
const { AccountPool } = require('./steam/accountPool');
const { BotEngine } = require('./bot/botEngine');
const { createApiRouter } = require('./api/routes');
const { bootstrapBackground } = require('./bootstrap');

process.on('unhandledRejection', (err) => {
  console.error('[unhandledRejection]', err?.message || err);
});

async function main() {
  const db = await initDatabase();
  const accountPool = new AccountPool(db);
  await accountPool.reconcileSessions();
  const botEngine = new BotEngine(db, accountPool);

  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use('/api', createApiRouter(db, accountPool, botEngine));

  const webDist = path.join(__dirname, '../../web/dist');
  app.use(express.static(webDist));
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(webDist, 'index.html'), (err) => {
      if (err) res.status(404).send('Web UI not built. Run: npm run dev -w @steam-bot/web');
    });
  });

  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: err.message || 'Internal error' });
  });

  app.listen(port, () => {
    console.log(`API http://localhost:${port}`);
    console.log(`Web  http://localhost:5173 (dev proxy)`);
    console.log(`Режимы: BOT_AUTO_START_SELL / BOT_AUTO_START_SCAN; вход — вручную`);
    bootstrapBackground(db, accountPool, botEngine).catch((err) => {
      console.error('Bootstrap:', err.message);
    });
  });
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
