const crypto = require('crypto');

/** Нижний регистр, trim, без спецсимволов, пробелы схлопнуты. */
function normalizeItemName(itemName) {
  return String(itemName || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ');
}

/** Первые 8 символов SHA-256 от нормализованного названия. */
function getItemId(itemName) {
  const normalized = normalizeItemName(itemName);
  if (!normalized) return null;
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 8);
}

module.exports = { getItemId, normalizeItemName };
