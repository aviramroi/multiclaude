import { Database } from "bun:sqlite"
import type { Store, User, Session, StoredEntry } from "./store"
import type { WireEntry } from "../core/transcript"

export function sqliteStore(path: string): Store {
  const db = new Database(path, { create: true })
  db.exec("PRAGMA journal_mode=WAL")
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, token TEXT UNIQUE NOT NULL,
      email TEXT, claim_code TEXT, claimed_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE UNIQUE INDEX IF NOT EXISTS users_claim_code ON users(claim_code);
    CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, name TEXT, owner TEXT NOT NULL, adapter TEXT NOT NULL DEFAULT 'claude',
      share_key TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS members (session_id TEXT NOT NULL, user_id TEXT NOT NULL, PRIMARY KEY (session_id, user_id));
    CREATE TABLE IF NOT EXISTS entries (seq INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, id TEXT NOT NULL, parent TEXT,
      type TEXT NOT NULL, ts TEXT, author TEXT NOT NULL, raw TEXT NOT NULL, UNIQUE (session_id, id));
    CREATE INDEX IF NOT EXISTS entries_session_seq ON entries(session_id, seq);
    CREATE TABLE IF NOT EXISTS otps (email TEXT PRIMARY KEY, code TEXT NOT NULL, expires_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS browser_sessions (id TEXT PRIMARY KEY, email TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
  `)
  try { db.exec("ALTER TABLE sessions ADD COLUMN forked_from TEXT") } catch {}
  const U = "id, name, email, claim_code, claimed_at, created_at"
  const q = {
    userByToken: db.query<User, [string]>(`SELECT ${U} FROM users WHERE token = ?`),
    userByClaim: db.query<User, [string]>(`SELECT ${U} FROM users WHERE claim_code = ?`),
    session: db.query<Session, [string]>("SELECT * FROM sessions WHERE id = ?"),
    isMember: db.query<{ n: number }, [string, string]>("SELECT count(*) n FROM members WHERE session_id = ? AND user_id = ?"),
    head: db.query<{ head: number; n: number }, [string]>("SELECT coalesce(max(seq),0) head, count(*) n FROM entries WHERE session_id = ?"),
    has: db.query<{ id: string }, [string, string]>("SELECT id FROM entries WHERE session_id = ? AND id = ?"),
    ins: db.query<{ seq: number }, [string, string, string | null, string, string | null, string, string]>(
      "INSERT OR IGNORE INTO entries (session_id, id, parent, type, ts, author, raw) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING seq",
    ),
    after: db.query<StoredEntry, [string, number]>("SELECT seq, id, parent, type, ts, author, raw FROM entries WHERE session_id = ? AND seq > ? ORDER BY seq"),
  }
  const insertMany = db.transaction((sid: string, entries: WireEntry[], author: string) => {
    const out: StoredEntry[] = []
    for (const e of entries) {
      const r = q.ins.get(sid, e.id, e.parent ?? null, e.type ?? "unknown", e.ts ?? null, author, e.raw)
      if (r) out.push({ ...e, seq: r.seq, author })
    }
    return out
  })
  return {
    async userByToken(t) { return q.userByToken.get(t) ?? null },
    async userByClaim(c) { return q.userByClaim.get(c) ?? null },
    async createUser(u) { db.query("INSERT INTO users (id, name, token, claim_code) VALUES (?, ?, ?, ?)").run(u.id, u.name, u.token, u.claimCode) },
    async claimUser(id, email) { db.query("UPDATE users SET email = ?, claimed_at = datetime('now') WHERE id = ?").run(email, id) },
    async machinesByEmail(email) { return db.query<{ name: string; created_at: string }, [string]>("SELECT name, created_at FROM users WHERE email = ? ORDER BY created_at").all(email) },
    async session(id) { return q.session.get(id) ?? null },
    async createSession(s) { db.query("INSERT INTO sessions (id, name, owner, adapter, share_key, forked_from) VALUES (?, ?, ?, ?, ?, ?)").run(s.id, s.name, s.owner, s.adapter, s.shareKey, s.forkedFrom ?? null) },
    async sessionsFor(userId, key) {
      const mine = db.query<Session, [string, string]>(
        "SELECT s.* FROM sessions s WHERE s.owner = ?1 UNION SELECT s.* FROM sessions s JOIN members m ON m.session_id = s.id WHERE m.user_id = ?2",
      ).all(userId, userId)
      const byKey = key ? db.query<Session, [string]>("SELECT * FROM sessions WHERE share_key = ?").all(key) : []
      const seen = new Set<string>()
      return [...mine, ...byKey].filter((s) => !seen.has(s.id) && seen.add(s.id)).sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
    },
    async sessionsByEmail(email) {
      return db.query<Session, [string]>(
        `SELECT DISTINCT s.* FROM sessions s JOIN users u ON u.id = s.owner WHERE u.email = ?1
         UNION SELECT DISTINCT s.* FROM sessions s JOIN members m ON m.session_id = s.id JOIN users u ON u.id = m.user_id WHERE u.email = ?1 ORDER BY updated_at DESC`,
      ).all(email)
    },
    async countByKey(key) { return db.query<{ n: number }, [string]>("SELECT count(*) n FROM sessions WHERE share_key = ?").get(key)!.n },
    async isMember(sid, uid) { return (q.isMember.get(sid, uid)?.n ?? 0) > 0 },
    async addMember(sid, uid) { db.query("INSERT OR IGNORE INTO members (session_id, user_id) VALUES (?, ?)").run(sid, uid) },
    async touch(sid) { db.query("UPDATE sessions SET updated_at = datetime('now') WHERE id = ?").run(sid) },
    async head(sid) { return q.head.get(sid)! },
    async existingIds(sid, ids) { return new Set(ids.filter((id) => q.has.get(sid, id))) },
    async insertEntries(sid, entries, author) { return insertMany(sid, entries, author) },
    async entriesAfter(sid, after) { return q.after.all(sid, after) },
    async setOtp(email, code, exp) { db.query("INSERT OR REPLACE INTO otps (email, code, expires_at, attempts) VALUES (?, ?, ?, 0)").run(email, code, exp) },
    async getOtp(email) { return db.query<{ code: string; expires_at: number; attempts: number }, [string]>("SELECT code, expires_at, attempts FROM otps WHERE email = ?").get(email) ?? null },
    async bumpOtp(email) { db.query("UPDATE otps SET attempts = attempts + 1 WHERE email = ?").run(email) },
    async deleteOtp(email) { db.query("DELETE FROM otps WHERE email = ?").run(email) },
    async createBrowserSession(id, email) { db.query("INSERT INTO browser_sessions (id, email) VALUES (?, ?)").run(id, email) },
    async browserEmail(id) { return db.query<{ email: string }, [string]>("SELECT email FROM browser_sessions WHERE id = ?").get(id)?.email ?? null },
    async getSetting(k) { return db.query<{ value: string | null }, [string]>("SELECT value FROM settings WHERE key = ?").get(k)?.value ?? null },
    async setSetting(k, v) { if (v === null) db.query("DELETE FROM settings WHERE key = ?").run(k); else db.query("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(k, v) },
  }
}
