/** Префиксы оружия CS2 (до «|» в market_hash_name). */
const WEAPON_PREFIXES = new Set([
  'AK-47',
  'M4A4',
  'M4A1-S',
  'AWP',
  'AUG',
  'SG 553',
  'FAMAS',
  'Galil AR',
  'SSG 08',
  'SCAR-20',
  'G3SG1',
  'Glock-18',
  'USP-S',
  'P2000',
  'P250',
  'Five-SeveN',
  'Tec-9',
  'CZ75-Auto',
  'Dual Berettas',
  'Desert Eagle',
  'R8 Revolver',
  'MAC-10',
  'MP9',
  'MP7',
  'MP5-SD',
  'UMP-45',
  'P90',
  'PP-Bizon',
  'Nova',
  'XM1014',
  'Sawed-Off',
  'MAG-7',
  'M249',
  'Negev',
  'Zeus x27',
]);

const CATEGORY_LABELS = {
  weapon_skin: 'Скин оружия',
  knife: 'Нож',
  gloves: 'Перчатки',
  case: 'Кейс',
  key: 'Ключ',
  sticker: 'Стикер',
  capsule: 'Кapsule / набор',
  graffiti: 'Граффити',
  patch: 'Нашивка',
  music_kit: 'Music Kit',
  agent: 'Агент',
  pin: 'Значок',
  tool: 'Инструмент',
  pass: 'Пропуск',
  souvenir_package: 'Souvenir Package',
  charm: 'Charm',
  container: 'Контейнер',
  collectible: 'Коллекционное',
  other: 'Прочее',
};

function stripPrefixes(name) {
  return name
    .replace(/^★\s*/u, '')
    .replace(/^StatTrak™\s*/u, '')
    .replace(/^Souvenir\s+/u, '')
    .trim();
}

function weaponPart(name) {
  const stripped = stripPrefixes(name);
  const pipe = stripped.indexOf('|');
  if (pipe === -1) return stripped;
  return stripped.slice(0, pipe).trim();
}

function isWeaponSkin(name) {
  const part = weaponPart(name);
  return WEAPON_PREFIXES.has(part);
}

/**
 * @param {string} marketHashName
 * @returns {keyof typeof CATEGORY_LABELS}
 */
function classifyCs2Item(marketHashName) {
  const name = String(marketHashName || '').trim();
  if (!name) return 'other';

  if (name.startsWith('★')) {
    if (/gloves?/iu.test(name)) return 'gloves';
    return 'knife';
  }

  const lower = name.toLowerCase();

  if (/\bkey$/i.test(name) || lower.includes(' case key')) return 'key';
  if (/\bcase$/i.test(name) && !name.includes('|')) return 'case';
  if (lower.startsWith('sticker |') || lower.includes(' sticker |')) return 'sticker';
  if (lower.includes('capsule')) return 'capsule';
  if (lower.startsWith('graffiti |') || /\bgraffiti$/i.test(name)) return 'graffiti';
  if (lower.startsWith('patch |')) return 'patch';
  if (lower.startsWith('music kit |')) return 'music_kit';
  if (lower.startsWith('charm |')) return 'charm';
  if (lower.startsWith('pin |') || lower.includes('collectible pin')) return 'pin';
  if (lower.includes('name tag') || lower.includes('storage unit') || lower.includes('swap tool') || lower.includes('gift tag')) {
    return 'tool';
  }
  if (lower.includes('operation pass') || lower.includes(' viewer pass') || /\bpass$/i.test(name)) return 'pass';
  if (lower.includes('souvenir package')) return 'souvenir_package';
  if (/\bpackage$/i.test(name) && !name.includes('|')) return 'container';
  if (lower.includes('autograph') && !name.includes('|')) return 'capsule';
  if (lower.includes('half-life') || lower.includes('alyx')) return 'collectible';

  if (isWeaponSkin(name)) return 'weapon_skin';

  if (name.includes('|')) return 'agent';

  if (/\bcase$/i.test(name)) return 'case';

  return 'other';
}

function categoryLabel(category) {
  return CATEGORY_LABELS[category] || category;
}

module.exports = {
  WEAPON_PREFIXES,
  CATEGORY_LABELS,
  classifyCs2Item,
  categoryLabel,
};
