// database.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const DB_PATH = path.join(__dirname, 'bot.db');

let db;

function initDB() {
  db = new sqlite3.Database(DB_PATH);
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      itemName TEXT,
      buyPrice REAL,
      sellPrice REAL,
      buyAt TEXT,
      note TEXT
    )`);
  });
}

function logPurchase(itemName, buyPrice, sellPrice = null, note = '') {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`INSERT INTO purchases (itemName, buyPrice, sellPrice, buyAt, note) VALUES (?, ?, ?, ?, ?)`);
    stmt.run(itemName, buyPrice, sellPrice, new Date().toISOString(), note, function (err) {
      if (err) return reject(err);
      resolve({ id: this.lastID });
    });
  });
}

function listPurchases(limit = 100) {
  return new Promise((resolve, reject) => {
    db.all(`SELECT * FROM purchases ORDER BY id DESC LIMIT ?`, [limit], (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

module.exports = { initDB, logPurchase, listPurchases };
