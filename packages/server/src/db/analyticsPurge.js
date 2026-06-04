const { get, run } = require('./database');

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const KEY_NEXT = 'analytics_next_purge_at';
const KEY_LAST = 'analytics_last_purge_at';

async function readState(db, key) {
  const row = await get(db, 'SELECT value FROM bot_state WHERE key = ?', [key]);
  return row?.value || null;
}

async function writeState(db, key, value) {
  await run(db, 'INSERT OR REPLACE INTO bot_state (key, value) VALUES (?, ?)', [key, value]);
}

async function clearMarketAnalytics(db) {
  const { clearItemMarketData } = require('./itemStore');
  await clearItemMarketData(db);
}

async function getAnalyticsPurgeSchedule(db) {
  let nextRaw = await readState(db, KEY_NEXT);
  const now = Date.now();
  if (!nextRaw) {
    const nextAt = now + WEEK_MS;
    await writeState(db, KEY_NEXT, String(nextAt));
    nextRaw = String(nextAt);
  }
  let nextAt = Number(nextRaw);
  if (!Number.isFinite(nextAt)) {
    nextAt = now + WEEK_MS;
    await writeState(db, KEY_NEXT, String(nextAt));
  }
  const lastRaw = await readState(db, KEY_LAST);
  const lastAt = lastRaw ? Number(lastRaw) : null;
  return {
    nextPurgeAt: nextAt,
    lastPurgeAt: Number.isFinite(lastAt) ? lastAt : null,
    intervalMs: WEEK_MS,
    msUntilPurge: Math.max(0, nextAt - now),
  };
}

async function scheduleNextPurge(db, fromMs = Date.now()) {
  const nextAt = fromMs + WEEK_MS;
  await writeState(db, KEY_NEXT, String(nextAt));
  return nextAt;
}

/** Ручная или авто-очистка снимков аналитики (сделки не трогаем). */
async function purgeMarketAnalytics(db, { manual = false } = {}) {
  await clearMarketAnalytics(db);
  const now = Date.now();
  await writeState(db, KEY_LAST, String(now));
  const nextAt = await scheduleNextPurge(db, now);
  return { purgedAt: now, nextPurgeAt: nextAt, manual };
}

async function purgeMarketAnalyticsIfDue(db) {
  const { nextPurgeAt, msUntilPurge } = await getAnalyticsPurgeSchedule(db);
  if (msUntilPurge > 0) return { purged: false };
  return { purged: true, ...(await purgeMarketAnalytics(db, { manual: false })) };
}

function startAnalyticsPurgeScheduler(db) {
  const tick = () => {
    purgeMarketAnalyticsIfDue(db).then((r) => {
      if (r.purged) {
        console.log('[analytics] авто-очистка аналитики и решений (раз в 7 дней)');
      }
    }).catch((err) => console.error('[analytics] purge:', err.message));
  };
  tick();
  return setInterval(tick, 60 * 60 * 1000);
}

module.exports = {
  WEEK_MS,
  clearMarketAnalytics,
  getAnalyticsPurgeSchedule,
  purgeMarketAnalytics,
  purgeMarketAnalyticsIfDue,
  startAnalyticsPurgeScheduler,
};
