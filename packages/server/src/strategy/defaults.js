const { DEFAULT_CS2_FILTERS } = require('./cs2Filters');

const BASE = {
  feePercent: 15,
  /** Покупаем только если прибыль % в этом коридоре (после комиссии). */
  minProfitPercent: 20,
  maxProfitPercent: 40,
  minLiquidity: 15,
  /** Нижняя граница 1-го тира ликвидности (продаж/сутки). */
  liquidityMin: 100,
  /** Верхняя граница 1-го тира; при L >= этого значения — ордер 2. */
  liquidityMax: 1000,
  /** Кол-во в buy-ордере при liquidityMin <= L < liquidityMax. */
  orderQtyMin: 25,
  /** Кол-во в buy-ордере при L >= liquidityMax. */
  orderQtyMax: 100,
  undercutStep: 0.01,
  maxSpendPerDay: 5000,
  /** Галочка в UI: лимит трат на покупки за сутки. */
  maxSpendPerDayEnabled: false,
  /** Сколько лотов за один тик сканирования обогащать ценами (меньше = быстрее тик). */
  scanItemsPerTick: 1,
  maxSellPerTick: 3,
  relistMorning: '08:00',
  relistAfternoon: '14:00',
  relistEvening: '20:00',
  dryRun: true,
};

const DEFAULT_STRATEGY = {
  dota: { ...BASE, game: 'dota', enabled: true, maxItemPrice: 200, holdDays: 7 },
  cs2: {
    ...BASE,
    game: 'cs2',
    enabled: true,
    maxItemPrice: 500,
    holdDays: 7,
    cs2Filters: { ...DEFAULT_CS2_FILTERS },
  },
  rust: { ...BASE, game: 'rust', enabled: true, maxItemPrice: 500, targetMarginPercent: 20 },
};

const APP_IDS = { dota: 570, cs2: 730, rust: 252490 };

function mergeStrategyConfig(game, saved = {}) {
  const base = DEFAULT_STRATEGY[game] || DEFAULT_STRATEGY.dota;
  const merged = { ...base, ...saved };
  if (base.cs2Filters) {
    merged.cs2Filters = { ...base.cs2Filters, ...(saved.cs2Filters || {}) };
  }
  return merged;
}

module.exports = { BASE, DEFAULT_STRATEGY, APP_IDS, mergeStrategyConfig };
