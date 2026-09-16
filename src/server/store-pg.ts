import { neon } from "@neondatabase/serverless"
import type { Store, User, Session, StoredEntry } from "./store"
import type { WireEntry } from "../core/transcript"

let ready: Promise<void> | null = null

/** Postgres store (Neon serverless HTTP driver) — used on Vercel. Schema is created lazily on first request. */
export function pgStore(url: string): Store {
  const sql = neon(url)
  const init = () =>
    (ready ??= (async () => {
      await sql`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, token TEXT UNIQUE NOT NULL,
        email TEXT, claim_code TEXT UNIQUE, claimed_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`
      await sql`CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, name TEXT, owner TEXT NOT NULL, adapter TEXT NOT NULL DEFAULT 'claude',
        share_key TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`
      await sql`CREATE INDEX IF NOT EXISTS sessions_share_key ON sessions(share_key)`
      await sql`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS forked_from TEXT`
      await sql`CREATE TABLE IF NOT EXISTS members (session_id TEXT NOT NULL, user_id TEXT NOT NULL, PRIMARY KEY (session_id, user_id))`
      await sql`CREATE TABLE IF NOT EXISTS entries (seq BIGSERIAL PRIMARY KEY, session_id TEXT NOT NULL, id TEXT NOT NULL, parent TEXT,
        type TEXT NOT NULL, ts TEXT, author TEXT NOT NULL, raw TEXT NOT NULL, UNIQUE (session_id, id))`
      await sql`CREATE INDEX IF NOT EXISTS entries_session_seq ON entries(session_id, seq)`
      await sql`CREATE TABLE IF NOT EXISTS otps (email TEXT PRIMARY KEY, code TEXT NOT NULL, expires_at BIGINT NOT NULL, attempts INT NOT NULL DEFAULT 0)`
      await sql`CREATE TABLE IF NOT EXISTS browser_sessions (id TEXT PRIMARY KEY, email TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`
    })())
  const row = <T>(r: Record<string, any>[]): T | null => (r[0] as T) ?? null
  const iso = (s: any): Session => ({ ...s, created_at: new Date(s.created_at).toISOString(), updated_at: new Date(s.updated_at).toISOString() })
  const num = (e: any): StoredEntry => ({ ...e, seq: Number(e.seq) })
  const wrap = <T extends (...a: any[]) => Promise<any>>(f: T): T => (async (...a: any[]) => (await init(), f(...a))) as T
  return {
    userByToken: wrap(async (t: string) => row<User>(await sql`SELECT id, name, email, claim_code, claimed_at::text, created_at::text FROM users WHERE token = ${t}`)),
    userByClaim: wrap(async (c: string) => row<User>(await sql`SELECT id, name, email, claim_code, claimed_at::text, created_at::text FROM users WHERE claim_code = ${c}`)),
    createUser: wrap(async (u) => { await sql`INSERT INTO users (id, name, token, claim_code) VALUES (${u.id}, ${u.name}, ${u.token}, ${u.claimCode})` }),
    claimUser: wrap(async (id, email) => { await sql`UPDATE users SET email = ${email}, claimed_at = now() WHERE id = ${id}` }),
    machinesByEmail: wrap(async (email) => (await sql`SELECT name, created_at::text FROM users WHERE email = ${email} ORDER BY created_at`) as any),
    session: wrap(async (id) => { const r = row<any>(await sql`SELECT * FROM sessions WHERE id = ${id}`); return r && iso(r) }),
    createSession: wrap(async (s) => { await sql`INSERT INTO sessions (id, name, owner, adapter, share_key, forked_from) VALUES (${s.id}, ${s.name}, ${s.owner}, ${s.adapter}, ${s.shareKey}, ${s.forkedFrom ?? null})` }),
    sessionsFor: wrap(async (uid, key) => {
      const rows = await sql`SELECT DISTINCT s.* FROM sessions s LEFT JOIN members m ON m.session_id = s.id
        WHERE s.owner = ${uid} OR m.user_id = ${uid} OR (${key}::text IS NOT NULL AND s.share_key = ${key}) ORDER BY s.updated_at DESC`
      return rows.map(iso)
    }),
    sessionsByEmail: wrap(async (email) => {
      const rows = await sql`SELECT DISTINCT s.* FROM sessions s LEFT JOIN members m ON m.session_id = s.id
        JOIN users u ON u.id = s.owner OR u.id = m.user_id WHERE u.email = ${email} ORDER BY s.updated_at DESC`
      return rows.map(iso)
    }),
    countByKey: wrap(async (key) => Number((await sql`SELECT count(*) n FROM sessions WHERE share_key = ${key}`)[0].n)),
    isMember: wrap(async (sid, uid) => Number((await sql`SELECT count(*) n FROM members WHERE session_id = ${sid} AND user_id = ${uid}`)[0].n) > 0),
    addMember: wrap(async (sid, uid) => { await sql`INSERT INTO members (session_id, user_id) VALUES (${sid}, ${uid}) ON CONFLICT DO NOTHING` }),
    touch: wrap(async (sid) => { await sql`UPDATE sessions SET updated_at = now() WHERE id = ${sid}` }),
    head: wrap(async (sid) => { const r = (await sql`SELECT coalesce(max(seq),0) head, count(*) n FROM entries WHERE session_id = ${sid}`)[0]; return { head: Number(r.head), n: Number(r.n) } }),
    existingIds: wrap(async (sid, ids) => {
      if (!ids.length) return new Set<string>()
      const rows = await sql`SELECT id FROM entries WHERE session_id = ${sid} AND id = ANY(${ids})`
      return new Set(rows.map((r: any) => r.id as string))
    }),
    insertEntries: wrap(async (sid, entries: WireEntry[], author) => {
      const out: StoredEntry[] = []
      for (const e of entries) {
        const r = await sql`INSERT INTO entries (session_id, id, parent, type, ts, author, raw)
          VALUES (${sid}, ${e.id}, ${e.parent ?? null}, ${e.type ?? "unknown"}, ${e.ts ?? null}, ${author}, ${e.raw}) ON CONFLICT DO NOTHING RETURNING seq`
        if (r[0]) out.push({ ...e, seq: Number(r[0].seq), author })
      }
      return out
    }),
    entriesAfter: wrap(async (sid, after) => (await sql`SELECT seq, id, parent, type, ts, author, raw FROM entries WHERE session_id = ${sid} AND seq > ${after} ORDER BY seq`).map(num)),
    setOtp: wrap(async (email, code, exp) => { await sql`INSERT INTO otps (email, code, expires_at, attempts) VALUES (${email}, ${code}, ${exp}, 0) ON CONFLICT (email) DO UPDATE SET code = ${code}, expires_at = ${exp}, attempts = 0` }),
    getOtp: wrap(async (email) => { const r = row<any>(await sql`SELECT code, expires_at, attempts FROM otps WHERE email = ${email}`); return r && { ...r, expires_at: Number(r.expires_at) } }),
    bumpOtp: wrap(async (email) => { await sql`UPDATE otps SET attempts = attempts + 1 WHERE email = ${email}` }),
    deleteOtp: wrap(async (email) => { await sql`DELETE FROM otps WHERE email = ${email}` }),
    createBrowserSession: wrap(async (id, email) => { await sql`INSERT INTO browser_sessions (id, email) VALUES (${id}, ${email})` }),
    browserEmail: wrap(async (id) => row<{ email: string }>(await sql`SELECT email FROM browser_sessions WHERE id = ${id}`)?.email ?? null),
  }
}
