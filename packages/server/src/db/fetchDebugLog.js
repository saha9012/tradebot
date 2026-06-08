const { run, all } = require('./database');

/** Авто-лог скана/продажи отключён — не раздуваем БД. */
async function logFetchStep() {
  return;
}

/** Только ручные проверки со страницы «Отладка». */
async function logManualDebugStep(db, {
  traceId,
  accountId = null,
  appId = null,
  marketHashName = null,
  step,
  ok = true,
  error = null,
  detail = null,
}) {
  if (!db || !traceId || !step) return;
  await run(
    db,
    `INSERT INTO fetch_debug_events (
      trace_id, account_id, app_id, market_hash_name, step, ok, error, detail_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      traceId,
      accountId,
      appId,
      marketHashName,
      step,
      ok ? 1 : 0,
      error,
      detail ? JSON.stringify(detail) : null,
    ]
  );
}

async function listFetchDebugEvents(db, { limit = 200, sinceId = 0 } = {}) {
  const cap = Math.min(Math.max(Number(limit) || 200, 1), 1000);
  const sid = Number(sinceId) || 0;
  if (sid > 0) {
    return all(
      db,
      `SELECT * FROM fetch_debug_events WHERE id > ? ORDER BY id ASC LIMIT ?`,
      [sid, cap]
    );
  }
  return all(
    db,
    `SELECT * FROM fetch_debug_events ORDER BY id DESC LIMIT ?`,
    [cap]
  );
}

async function clearFetchDebugEvents(db) {
  await run(db, 'DELETE FROM fetch_debug_events');
}

module.exports = {
  logFetchStep,
  logManualDebugStep,
  listFetchDebugEvents,
  clearFetchDebugEvents,
};
