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
    CREATE TABLE IF NOT EXISTS otps (
      email TEXT NOT NULL, code TEXT NOT NULL, expires_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS browser_sessions (
      id TEXT PRIMARY KEY, email TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)
  // machine accounts (users) get claimed by a human via email — additive columns for older DBs
  for (const col of ["email TEXT", "claim_code TEXT", "claimed_at TEXT"]) {
    try {
      db.exec(`ALTER TABLE users ADD COLUMN ${col}`)
    } catch {}
  }
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS users_claim_code ON users(claim_code)")
  return db
}

export type Db = ReturnType<typeof openDb>
