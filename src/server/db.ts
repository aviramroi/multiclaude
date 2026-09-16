import { Database } from "bun:sqlite"

export function openDb(path: string) {
  const db = new Database(path, { create: true })
  db.exec("PRAGMA journal_mode=WAL")
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, token TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY, name TEXT, owner TEXT NOT NULL REFERENCES users(id),
      adapter TEXT NOT NULL DEFAULT 'claude', share_key TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS members (
      session_id TEXT NOT NULL REFERENCES sessions(id), user_id TEXT NOT NULL REFERENCES users(id),
      PRIMARY KEY (session_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS entries (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      id TEXT NOT NULL, parent TEXT, type TEXT NOT NULL, ts TEXT,
      author TEXT NOT NULL, raw TEXT NOT NULL,
      UNIQUE (session_id, id)
    );
    CREATE INDEX IF NOT EXISTS entries_session_seq ON entries(session_id, seq);
  `)
  return db
}

export type Db = ReturnType<typeof openDb>
