/**
 * Database wrapper using Node.js built-in node:sqlite (Node 22+)
 * No native compilation needed — zero external dependencies for the DB layer.
 */
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '../../data');
const DB_PATH  = path.join(DATA_DIR, 'tainara_nails.db');

let _db = null;

function getDb() {
  if (_db) return _db;

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  _db = new DatabaseSync(DB_PATH);

  // Performance & safety pragmas
  _db.exec('PRAGMA journal_mode = WAL;');
  _db.exec('PRAGMA foreign_keys = ON;');
  _db.exec('PRAGMA synchronous = NORMAL;');

  return _db;
}

/**
 * Thin helpers that mimic the better-sqlite3 API so the routes stay unchanged.
 */
function prepare(sql) {
  const db = getDb();
  const stmt = db.prepare(sql);

  return {
    /** Run INSERT / UPDATE / DELETE — returns { lastInsertRowid, changes } */
    run(...args) {
      const flat = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
      return stmt.run(...flat);
    },
    /** Return first matching row or undefined */
    get(...args) {
      const flat = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
      return stmt.get(...flat);
    },
    /** Return all matching rows */
    all(...args) {
      const flat = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
      return stmt.all(...flat);
    },
  };
}

function exec(sql) {
  getDb().exec(sql);
}

module.exports = { getDb, prepare, exec };
