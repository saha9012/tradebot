function verboseFetchDebug() {
  return process.env.BOT_VERBOSE_FETCH_DEBUG === 'true';
}

function compactProbeResults(steps, batchStep) {
  return steps
    .filter((s) => s.step !== batchStep)
    .map((s) => ({
      id: s.step,
      ok: Boolean(s.ok),
      ms: s.ms ?? null,
      nameid: s.itemNameId || null,
      err: s.error ? String(s.error).slice(0, 120) : s.reason || null,
    }));
}

/**
 * В UI: одна строка batch + playwright; детали в meta.results.
 * Полный лог каждой стратегии — BOT_VERBOSE_FETCH_DEBUG=true.
 */
async function logProbeToDb(logFn, steps, { batchStep, alwaysSteps = [] }) {
  const batch = steps.find((s) => s.step === batchStep);
  const results = compactProbeResults(steps, batchStep);

  if (batch) {
    await logFn(
      batchStep,
      batch.ok !== false && !batch.skipped,
      batch.error || batch.reason || null,
      { ...(batch.meta || {}), results }
    );
  }

  if (verboseFetchDebug()) {
    for (const s of steps) {
      if (s.step === batchStep) continue;
      await logFn(s.step, s.ok !== false && !s.skipped, s.error || s.reason || null, s);
    }
    return;
  }

  for (const id of alwaysSteps) {
    const s = steps.find((x) => x.step === id);
    if (s) {
      await logFn(s.step, s.ok !== false && !s.skipped, s.error || s.reason || null, s.meta || s);
    }
  }

  const winner = steps.find(
    (s) =>
      s.ok &&
      s.itemNameId &&
      s.step !== batchStep &&
      !alwaysSteps.includes(s.step)
  );
  if (winner) {
    await logFn(winner.step, true, null, { itemNameId: winner.itemNameId, ms: winner.ms });
  }
}

module.exports = { verboseFetchDebug, compactProbeResults, logProbeToDb };
