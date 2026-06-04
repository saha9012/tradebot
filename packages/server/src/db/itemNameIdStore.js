const { run, get, all } = require('./database');

/** item_nameid в Steam — только цифры (обычно 6–12 знаков). */
function isValidItemNameId(itemNameId) {
  return /^\d{4,15}$/.test(String(itemNameId || '').trim());
}

/** Постоянная база hash_name → item_nameid (не протухает за 10 мин как price_cache). */
async function getStoredItemNameId(db, appId, marketHashName) {
  const row = await get(
    db,
    `SELECT item_name_id FROM item_name_ids WHERE app_id = ? AND market_hash_name = ?`,
    [appId, marketHashName]
  );
  if (!row?.item_name_id) return null;
  const id = String(row.item_name_id).trim();
  if (!isValidItemNameId(id)) {
    await run(
      db,
      `DELETE FROM item_name_ids WHERE app_id = ? AND market_hash_name = ?`,
      [appId, marketHashName]
    );
    return null;
  }
  return id;
}

async function saveItemNameId(db, appId, marketHashName, itemNameId, source = 'unknown') {
  const id = String(itemNameId || '').trim();
  if (!isValidItemNameId(id)) {
    console.warn(
      `[item_nameid] не сохраняем невалидный id для ${marketHashName}:`,
      id.slice(0, 80)
    );
    return;
  }
  await run(
    db,
    `INSERT OR REPLACE INTO item_name_ids (app_id, market_hash_name, item_name_id, source, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))`,
    [appId, marketHashName, id, source]
  );
}

/** Удалить битые записи (например, случайно сохранённый код функции). */
async function purgeInvalidItemNameIds(db) {
  const rows = await all(db, 'SELECT app_id, market_hash_name, item_name_id FROM item_name_ids');
  let removed = 0;
  for (const row of rows) {
    if (!isValidItemNameId(row.item_name_id)) {
      await run(
        db,
        `DELETE FROM item_name_ids WHERE app_id = ? AND market_hash_name = ?`,
        [row.app_id, row.market_hash_name]
      );
      removed += 1;
    }
  }
  if (removed > 0) {
    console.warn(`[item_nameid] удалено невалидных записей: ${removed}`);
  }
  return removed;
}

module.exports = {
  getStoredItemNameId,
  saveItemNameId,
  purgeInvalidItemNameIds,
  isValidItemNameId,
};
