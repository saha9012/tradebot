const { get, run } = require('../db/database');
const { DOTA_SEARCH_QUERIES } = require('./dotaSearchQueries');

const DEFAULT_CURSOR = { mode: 'browse', queryIdx: 0, start: 0 };

function cursorKey(accountId) {
  return `scan_cursor_${accountId}`;
}

async function loadScanCursor(db, accountId) {
  const row = await get(db, 'SELECT value FROM bot_state WHERE key = ?', [cursorKey(accountId)]);
  if (!row?.value) return { ...DEFAULT_CURSOR };
  try {
    const parsed = JSON.parse(row.value);
    return {
      mode: parsed.mode === 'query' ? 'query' : 'browse',
      queryIdx: Number(parsed.queryIdx) || 0,
      start: Number(parsed.start) || 0,
    };
  } catch {
    return { ...DEFAULT_CURSOR };
  }
}

async function saveScanCursor(db, accountId, cursor) {
  await run(db, 'INSERT OR REPLACE INTO bot_state (key, value) VALUES (?, ?)', [
    cursorKey(accountId),
    JSON.stringify(cursor),
  ]);
}

/**
 * Сдвигает окно сканирования: каждый тик +pageSize, при конце ленты — другой режим/запрос.
 */
async function advanceScanCursor(db, accountId, cursor, totalCount, pageSize) {
  const next = { ...cursor, start: cursor.start + pageSize };
  const maxStart = Math.max(0, (totalCount || 0) - pageSize);
  const hitEnd = next.start > maxStart || next.start >= 900;

  if (hitEnd) {
    next.start = 0;
    if (cursor.mode === 'browse') {
      next.mode = 'query';
    } else {
      next.mode = 'browse';
      next.queryIdx = (cursor.queryIdx + 1) % DOTA_SEARCH_QUERIES.length;
    }
  }

  await saveScanCursor(db, accountId, next);
  return next;
}

function describeCursor(cursor) {
  if (cursor.mode === 'browse') {
    return `популярные, стр. с ${cursor.start}`;
  }
  const q = DOTA_SEARCH_QUERIES[cursor.queryIdx % DOTA_SEARCH_QUERIES.length];
  return `запрос «${q}», стр. с ${cursor.start}`;
}

module.exports = {
  loadScanCursor,
  saveScanCursor,
  advanceScanCursor,
  describeCursor,
  DOTA_SEARCH_QUERIES,
};
