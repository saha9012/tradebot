const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const { dbPath } = require('../config');
const { DEFAULT_STRATEGY } = require('../strategy/defaults');
const { actionRu, translateError } = require('../util/auditMessages');

function openDb() {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  return new sqlite3.Database(dbPath);
}

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function get(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

async function initDatabase() {
  const db = openDb();

  await run(db, `CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY, label TEXT NOT NULL, game TEXT NOT NULL,
    credentials_env TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'offline', wallet_balance REAL,
    steam_id TEXT, last_error TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  await run(db, `CREATE TABLE IF NOT EXISTS strategy_config (
    account_id TEXT PRIMARY KEY, config_json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  await run(db, `CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT, account_id TEXT NOT NULL,
    game TEXT NOT NULL, action TEXT NOT NULL, market_hash_name TEXT,
    price REAL, profit REAL, dry_run INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  await run(db, `CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT, account_id TEXT,
    level TEXT NOT NULL DEFAULT 'info', action TEXT NOT NULL,
    message TEXT, meta_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  await run(db, `CREATE TABLE IF NOT EXISTS bot_state (
    key TEXT PRIMARY KEY, value TEXT NOT NULL
  )`);

  await run(db, `CREATE TABLE IF NOT EXISTS price_cache (
    app_id INTEGER NOT NULL,
    market_hash_name TEXT NOT NULL,
    data_json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (app_id, market_hash_name)
  )`);

  await run(db, `CREATE TABLE IF NOT EXISTS fetch_debug_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trace_id TEXT NOT NULL,
    account_id TEXT,
    app_id INTEGER,
    market_hash_name TEXT,
    step TEXT NOT NULL,
    ok INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    detail_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  await run(db, `CREATE TABLE IF NOT EXISTS item_name_ids (
    app_id INTEGER NOT NULL,
    market_hash_name TEXT NOT NULL,
    item_name_id TEXT NOT NULL,
    source TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (app_id, market_hash_name)
  )`);

  await run(db, `CREATE TABLE IF NOT EXISTS market_catalog (
    app_id INTEGER NOT NULL,
    market_hash_name TEXT NOT NULL,
    sell_price_cents INTEGER NOT NULL,
    qty INTEGER,
    listing_url TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (app_id, market_hash_name)
  )`);

  await run(db, `CREATE TABLE IF NOT EXISTS market_item_snapshots (
    account_id TEXT NOT NULL DEFAULT '',
    item_id TEXT NOT NULL,
    game TEXT NOT NULL,
    app_id INTEGER NOT NULL,
    market_hash_name TEXT NOT NULL,
    highest_buy_order REAL,
    lowest_listing REAL,
    sales_per_day INTEGER,
    listing_url TEXT,
    steam_raw_json TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (account_id, item_id)
  )`);

  await run(db, `CREATE TABLE IF NOT EXISTS market_item_decisions (
    account_id TEXT NOT NULL DEFAULT '',
    item_id TEXT NOT NULL,
    game TEXT NOT NULL,
    app_id INTEGER NOT NULL,
    market_hash_name TEXT NOT NULL,
    highest_buy_order REAL,
    lowest_listing REAL,
    buy_order_price REAL,
    sell_listing_price REAL,
    profit REAL,
    profit_percent REAL,
    decision TEXT,
    skip_reason TEXT,
    listing_url TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (account_id, item_id)
  )`);

  await run(db, `CREATE TABLE IF NOT EXISTS market_sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    asset_id TEXT NOT NULL,
    game TEXT NOT NULL,
    app_id INTEGER,
    market_hash_name TEXT NOT NULL,
    sell_price REAL,
    listing_url TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(account_id, asset_id)
  )`);

  await run(db, `CREATE TABLE IF NOT EXISTS item_price_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT NOT NULL DEFAULT '',
    item_id TEXT NOT NULL,
    app_id INTEGER,
    market_hash_name TEXT,
    highest_buy_order REAL,
    lowest_listing REAL,
    sales_per_day INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  await run(db, `CREATE TABLE IF NOT EXISTS market_decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT,
    game TEXT NOT NULL,
    app_id INTEGER NOT NULL,
    market_hash_name TEXT NOT NULL,
    analytics_id INTEGER,
    highest_buy_order REAL,
    lowest_listing REAL,
    buy_order_price REAL,
    sell_listing_price REAL,
    profit REAL,
    profit_percent REAL,
    decision TEXT,
    skip_reason TEXT,
    listing_url TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  await run(db, `CREATE TABLE IF NOT EXISTS market_analytics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT,
    game TEXT NOT NULL,
    app_id INTEGER NOT NULL,
    market_hash_name TEXT NOT NULL,
    item_name_id TEXT,
    highest_buy_order REAL,
    lowest_listing REAL,
    buy_order_price REAL,
    sell_listing_price REAL,
    profit REAL,
    profit_percent REAL,
    sales_per_day INTEGER,
    sales_per_week INTEGER,
    price_source TEXT,
    decision TEXT,
    skip_reason TEXT,
    listing_url TEXT,
    steam_raw_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  await migrateTradeColumns(db);

  const count = await get(db, 'SELECT COUNT(*) as c FROM accounts');
  if (count.c === 0) {
    const defaults = [
      { id: 'account-1', label: 'Dota Account', game: 'dota', credentials_env: 'ACCOUNT_1', enabled: 1 },
      { id: 'account-2', label: 'CS2 Account', game: 'cs2', credentials_env: 'ACCOUNT_2', enabled: 0 },
      { id: 'account-3', label: 'Rust Account', game: 'rust', credentials_env: 'ACCOUNT_3', enabled: 0 },
    ];
    for (const acc of defaults) {
      await run(db, `INSERT INTO accounts (id, label, game, credentials_env, enabled) VALUES (?, ?, ?, ?, ?)`,
        [acc.id, acc.label, acc.game, acc.credentials_env, acc.enabled]);
      await run(db, `INSERT INTO strategy_config (account_id, config_json) VALUES (?, ?)`,
        [acc.id, JSON.stringify(DEFAULT_STRATEGY[acc.game])]);
    }
  }

  const states = [
    ['running', 'false'],
    ['running_scan', 'false'],
    ['running_sell', 'false'],
  ];
  for (const [key, value] of states) {
    const row = await get(db, 'SELECT value FROM bot_state WHERE key = ?', [key]);
    if (!row) await run(db, 'INSERT INTO bot_state (key, value) VALUES (?, ?)', [key, value]);
  }

  const { purgeInvalidItemNameIds } = require('./itemNameIdStore');
  await purgeInvalidItemNameIds(db);

  return db;
}

async function migrateTradeColumns(db) {
  const cols = await all(db, 'PRAGMA table_info(trades)');
  const names = new Set(cols.map((c) => c.name));
  const add = async (sql) => {
    try {
      await run(db, sql);
    } catch {
      /* column may already exist */
    }
  };
  if (!names.has('listing_url')) await add('ALTER TABLE trades ADD COLUMN listing_url TEXT');
  if (!names.has('app_id')) await add('ALTER TABLE trades ADD COLUMN app_id INTEGER');
  if (!names.has('item_name_id')) await add('ALTER TABLE trades ADD COLUMN item_name_id TEXT');
  if (!names.has('analytics_id')) await add('ALTER TABLE trades ADD COLUMN analytics_id INTEGER');
  if (!names.has('item_id')) await add('ALTER TABLE trades ADD COLUMN item_id TEXT');
}

async function logAudit(db, { accountId, level, action, message, meta }) {
  const ruAction = actionRu(action);
  const ruMessage = message ? translateError(message) : null;
  await run(db, `INSERT INTO audit_log (account_id, level, action, message, meta_json) VALUES (?, ?, ?, ?, ?)`,
    [accountId || null, level || 'info', ruAction, ruMessage, meta ? JSON.stringify(meta) : null]);
}

module.exports = { openDb, run, get, all, initDatabase, logAudit };
