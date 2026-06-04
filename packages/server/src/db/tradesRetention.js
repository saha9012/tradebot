const { run } = require('./database');

async function purgeOldTrades(db, retentionDays) {
  const days = Math.max(1, Number(retentionDays) || 14);
  const result = await run(
    db,
    `DELETE FROM trades WHERE created_at < datetime('now', ?)`,
    [`-${days} days`]
  );
  return { deleted: result.changes ?? 0, retentionDays: days };
}

function startTradesRetentionScheduler(db, retentionDays) {
  const days = Math.max(1, Number(retentionDays) || 14);
  const tick = () => {
    purgeOldTrades(db, days)
      .then((r) => {
        if (r.deleted > 0) {
          console.log(`[trades] удалено старых сделок: ${r.deleted} (старше ${days} дн.)`);
        }
      })
      .catch((err) => console.error('[trades] purge:', err.message));
  };
  tick();
  return setInterval(tick, 24 * 60 * 60 * 1000);
}

module.exports = { purgeOldTrades, startTradesRetentionScheduler };
