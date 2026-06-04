const { isValidItemNameId } = require('../../db/itemNameIdStore');

/**
 * Параллельный прогон стратегий: все Promise сразу, в лог — результат каждой.
 * @param {Array<{ id: string, run: () => Promise<object> }>} strategies
 * @param {(result: object) => boolean} isSuccess
 */
async function runParallelStrategies(strategies, isSuccess) {
  const steps = [];
  let winner = null;

  const results = await Promise.allSettled(
    strategies.map(async ({ id, run }) => {
      const ms = Date.now();
      const value = await run();
      return { id, ms: Date.now() - ms, ...value };
    })
  );

  for (let i = 0; i < strategies.length; i += 1) {
    const { id } = strategies[i];
    const settled = results[i];
    if (settled.status === 'fulfilled') {
      const v = settled.value;
      const ok = isSuccess(v);
      steps.push({
        step: id,
        ok,
        itemNameId: v.itemNameId ?? null,
        error: ok ? null : v.error || 'не сработало',
        meta: v.meta ?? null,
        ms: v.ms,
        ...(v.prices ? { prices: v.prices } : {}),
      });
      if (!winner && ok) winner = { id, value: v };
    } else {
      steps.push({
        step: id,
        ok: false,
        error: settled.reason?.message || String(settled.reason),
      });
    }
  }

  return { steps, winner };
}

function nameIdSuccess(v) {
  return isValidItemNameId(v?.itemNameId);
}

function histogramSuccess(v) {
  return v?.lowestListing != null && v?.highestBuyOrder != null;
}

module.exports = { runParallelStrategies, nameIdSuccess, histogramSuccess, isValidItemNameId };
