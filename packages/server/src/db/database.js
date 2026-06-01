const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const { dbPath } = require('../config');
const { DEFAULT_STRATEGY } = require('../strategy/defaults');

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

  const botRunning = await get(db, "SELECT value FROM bot_state WHERE key = 'running'");
  if (!botRunning) await run(db, "INSERT INTO bot_state (key, value) VALUES ('running', 'false')");

  return db;
}

async function logAudit(db, { accountId, level, action, message, meta }) {
  await run(db, `INSERT INTO audit_log (account_id, level, action, message, meta_json) VALUES (?, ?, ?, ?, ?)`,
    [accountId || null, level || 'info', action, message || null, meta ? JSON.stringify(meta) : null]);
}

module.exports = { openDb, run, get, all, initDatabase, logAudit };
