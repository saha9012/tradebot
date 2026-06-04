const { run, get } = require('../db/database');
const { mergeSearchRenderPayload } = require('./marketDomParser');
const { gameToAppId } = require('../providers/steam/priceFetcher');

const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_MAX_PAGES = 50;

async function upsertCatalogRow(db, appId, row) {
  if (!row.hash_name || row.sell_price == null) return;
  await run(
    db,
    `INSERT INTO market_catalog (app_id, market_hash_name, sell_price_cents, qty, listing_url, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(app_id, market_hash_name) DO UPDATE SET
       sell_price_cents = excluded.sell_price_cents,
       qty = excluded.qty,
       listing_url = excluded.listing_url,
       updated_at = datetime('now')`,
    [
      appId,
      row.hash_name,
      row.sell_price,
      row.qty ?? null,
      row.listing_url ?? null,
    ]
  );
}

/**
 * Один запрос search/render → парсинг DOM из results_html → SQLite.
 */
async function syncMarketCatalogPage(priceFetcher, db, appId, cookies, { start = 0, count = DEFAULT_PAGE_SIZE, query = '' } = {}) {
  const payload = await priceFetcher.fetchSearchRenderRaw(appId, cookies, { start, count, query });
  const rows = mergeSearchRenderPayload(payload).filter((r) => r.hash_name && r.sell_price != null);

  for (const row of rows) {
    await upsertCatalogRow(db, appId, row);
  }

  return {
    start,
    count,
    written: rows.length,
    totalCount: payload.total_count || 0,
    success: Boolean(payload.success),
  };
}

/**
 * Листает страницы маркета (browse или query). Пауза между страницами — rate limiter внутри priceFetcher.
 */
async function syncMarketCatalog(
  priceFetcher,
  db,
  { appId, cookies, query = '', pageSize = DEFAULT_PAGE_SIZE, maxPages = DEFAULT_MAX_PAGES } = {}
) {
  let start = 0;
  let pages = 0;
  let totalWritten = 0;
  let totalCount = 0;

  while (pages < maxPages) {
    const page = await syncMarketCatalogPage(priceFetcher, db, appId, cookies, {
      start,
      count: pageSize,
      query,
    });
    pages += 1;
    totalWritten += page.written;
    totalCount = page.totalCount || totalCount;

    if (!page.written || page.written < pageSize) break;
    start += pageSize;
    if (totalCount && start >= totalCount) break;
  }

  await run(db, `INSERT OR REPLACE INTO bot_state (key, value) VALUES (?, ?)`, [
    `market_catalog_sync_${appId}`,
    JSON.stringify({
      at: new Date().toISOString(),
      pages,
      totalWritten,
      totalCount,
      query: query || null,
    }),
  ]);

  return { pages, totalWritten, totalCount, appId };
}

async function getCatalogPrice(db, appId, marketHashName) {
  const row = await get(
    db,
    `SELECT sell_price_cents, qty, listing_url, updated_at
     FROM market_catalog WHERE app_id = ? AND market_hash_name = ?`,
    [appId, marketHashName]
  );
  if (!row?.sell_price_cents) return null;
  return {
    sellPriceCents: row.sell_price_cents,
    lowestListing: Number(row.sell_price_cents) / 100,
    qty: row.qty,
    listingUrl: row.listing_url,
    updatedAt: row.updated_at,
    priceSource: 'market_catalog',
  };
}

async function syncGameCatalog(priceFetcher, db, game, session, options = {}) {
  const appId = gameToAppId(game);
  const cookies = session?.cookieHeader || '';
  return syncMarketCatalog(priceFetcher, db, {
    appId,
    cookies,
    ...options,
  });
}

module.exports = {
  syncMarketCatalog,
  syncMarketCatalogPage,
  syncGameCatalog,
  getCatalogPrice,
  DEFAULT_PAGE_SIZE,
};
