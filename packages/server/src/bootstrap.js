const { all, get, run, logAudit } = require('./db/database');

async function migrateBotState(db) {
  const legacy = await get(db, "SELECT value FROM bot_state WHERE key = 'running'");
  const scan = await get(db, "SELECT value FROM bot_state WHERE key = 'running_scan'");
  if (legacy?.value === 'true' && !scan) {
    await run(db, "INSERT OR REPLACE INTO bot_state (key, value) VALUES ('running_scan', 'true')");
  }
}

/**
 * Возобновление режимов после перезапуска (без автологина).
 */
async function bootstrapBackground(db, accountPool, botEngine) {
  await migrateBotState(db);

  const scanWasOn = await botEngine.isScanRunning();
  const sellWasOn = await botEngine.isSellRunning();

  if (sellWasOn && !botEngine.sellInterval) {
    await botEngine.startSell();
    await logAudit(db, {
      action: 'auto_start',
      message: 'Режим продажи возобновлён после перезапуска сервера',
    });
  }

  if (scanWasOn && !botEngine.scanInterval) {
    await botEngine.startScan();
    await logAudit(db, {
      action: 'auto_start',
      message: 'Режим поиска возобновлён после перезапуска сервера',
    });
  }
}

module.exports = { bootstrapBackground };
