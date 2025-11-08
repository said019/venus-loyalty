// lib/db.js
import Database from "better-sqlite3";
import fs from "fs";

const DB_PATH = process.env.DB_PATH || "venus.db";
const dir = DB_PATH.includes("/") ? DB_PATH.slice(0, DB_PATH.lastIndexOf("/")) : ".";
if (dir && dir !== "." && dir !== "/data") {
  try { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); } catch {}
}

const db = new Database(DB_PATH);

// Esquema mínimo
db.exec(`
CREATE TABLE IF NOT EXISTS cards(
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  stamps INTEGER NOT NULL DEFAULT 0,
  max INTEGER NOT NULL DEFAULT 8,
  google_object_id TEXT,
  apple_serial TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS events(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id TEXT NOT NULL,
  type TEXT NOT NULL,          -- 'ISSUE' | 'STAMP' | 'REDEEM'
  meta TEXT,                   -- JSON
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS admins(
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  pass_hash TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS events_card_id_idx ON events(card_id);
`);

export default db;