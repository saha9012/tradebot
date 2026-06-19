const { classifyCs2Item, categoryLabel } = require('./cs2ItemClassifier');

/** Категории, которые по умолчанию исключаем для CS2 (не скины оружия). */
const DEFAULT_CS2_FILTERS = {
  knife: true,
  gloves: true,
  case: true,
  key: true,
  sticker: true,
  capsule: true,
  graffiti: true,
  patch: true,
  music_kit: true,
  agent: true,
  pin: true,
  tool: true,
  pass: true,
  souvenir_package: true,
  charm: true,
  container: true,
  collectible: true,
  other: true,
  weapon_skin: false,
};

function mergeCs2Filters(saved = {}) {
  return { ...DEFAULT_CS2_FILTERS, ...saved };
}

/**
 * @returns {{ allowed: boolean, category: string, categoryLabel: string }}
 */
function checkCs2ItemAllowed(config, marketHashName) {
  const category = classifyCs2Item(marketHashName);
  const filters = mergeCs2Filters(config.cs2Filters);
  const excluded = Boolean(filters[category]);
  return {
    allowed: !excluded,
    category,
    categoryLabel: categoryLabel(category),
    excluded,
  };
}

function cs2FilterSkip(marketHashName, check) {
  return {
    action: 'skip',
    reason: 'cs2_filter_excluded',
    marketHashName,
    meta: {
      category: check.category,
      categoryLabel: check.categoryLabel,
    },
  };
}

module.exports = {
  DEFAULT_CS2_FILTERS,
  mergeCs2Filters,
  checkCs2ItemAllowed,
  cs2FilterSkip,
};
