import type { ServerWebSocket } from "bun"
import { openDb } from "./db"
import type { WireEntry } from "../core/transcript"

const PORT = Number(process.env.PORT ?? 4747)
const db = openDb(process.env.MULTICLAUDE_DB ?? "multiclaude.db")

const rooms = new Map<string, Set<ServerWebSocket<WsData>>>()

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } })
const err = (msg: string, status: number) => json({ error: msg }, status)
const rid = () => crypto.randomUUID()
const key = () => crypto.randomUUID().replace(/-/g, "").slice(0, 20)

interface User { id: string; name: string }
type WsData = { sessionId: string; user: User }
interface Session { id: string; name: string | null; owner: string; adapter: string; share_key: string; created_at: string; updated_at: string }

const q = {
  userByToken: db.query<User, [string]>("SELECT id, name FROM users WHERE token = ?"),
  session: db.query<Session, [string]>("SELECT * FROM sessions WHERE id = ?"),
  isMember: db.query<{ n: number }, [string, string]>(
    "SELECT count(*) n FROM members WHERE session_id = ? AND user_id = ?",
  ),
  addMember: db.query("INSERT OR IGNORE INTO members (session_id, user_id) VALUES (?, ?)"),
  head: db.query<{ head: number; n: number }, [string]>(
    "SELECT coalesce(max(seq),0) head, count(*) n FROM entries WHERE session_id = ?",
  ),
  hasEntry: db.query<{ n: number }, [string, string]>("SELECT count(*) n FROM entries WHERE session_id = ? AND id = ?"),
  insertEntry: db.query(
    "INSERT OR IGNORE INTO entries (session_id, id, parent, type, ts, author, raw) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ),
  entriesAfter: db.query<WireEntry & { author: string }, [string, number]>(
    "SELECT seq, id, parent, type, ts, author, raw FROM entries WHERE session_id = ? AND seq > ? ORDER BY seq",
  ),
  touch: db.query("UPDATE sessions SET updated_at = datetime('now') WHERE id = ?"),
  mySessions: db.query<Session, [string, string]>(
    `SELECT s.* FROM sessions s WHERE s.owner = ?1
     UNION SELECT s.* FROM sessions s JOIN members m ON m.session_id = s.id WHERE m.user_id = ?2
     ORDER BY updated_at DESC`,
  ),
}

function auth(req: Request, url: URL): User | null {
  const h = req.headers.get("authorization")
  const token = h?.startsWith("Bearer ") ? h.slice(7) : url.searchParams.get("token")
  return token ? q.userByToken.get(token) : null
}

function canAccess(s: Session, user: User | null, shareKey: string | null): boolean {
  if (shareKey && shareKey === s.share_key) return true
  if (!user) return false
  return s.owner === user.id || (q.isMember.get(s.id, user.id)?.n ?? 0) > 0
}

function withMeta(s: Session, includeKey: boolean) {
  const h = q.head.get(s.id)!
  const { share_key, ...rest } = s
  return { ...rest, ...(includeKey ? { share_key } : {}), head: h.head, entries: h.n }
}

function addEntries(sessionId: string, user: User, entries: WireEntry[]) {
  const added: (WireEntry & { author: string })[] = []
  db.transaction(() => {
    for (const e of entries) {
      if (!e?.id || typeof e.raw !== "string") continue
      if (q.hasEntry.get(sessionId, e.id)!.n) continue
      q.insertEntry.run(sessionId, e.id, e.parent ?? null, e.type ?? "unknown", e.ts ?? null, user.name, e.raw)
      const seq = db.query<{ s: number }, []>("SELECT last_insert_rowid() s").get()!.s
      added.push({ ...e, seq, author: user.name })
    }
    if (added.length) q.touch.run(sessionId)
  })()
  if (added.length) broadcast(sessionId, { type: "entries", entries: added })
  return added
}

function broadcast(sessionId: string, msg: unknown, except?: ServerWebSocket<WsData>) {
  const payload = JSON.stringify(msg)
  for (const ws of rooms.get(sessionId) ?? []) if (ws !== except) ws.send(payload)
}

const server = Bun.serve<WsData>({
  port: PORT,
  async fetch(req, server) {
    const url = new URL(req.url)
    const path = url.pathname
    const user = auth(req, url)
    const shareKey = req.headers.get("x-share-key") ?? url.searchParams.get("key")

    if (path === "/health") return json({ ok: true, version: "0.1.0" })

    if (path === "/auth/register" && req.method === "POST") {
      const body = (await req.json().catch(() => ({}))) as { name?: string }
      const name = (body.name ?? "").trim()
      if (!name) return err("name required", 400)
      const id = rid()
      const token = "mc_" + crypto.randomUUID().replace(/-/g, "")
      db.query("INSERT INTO users (id, name, token) VALUES (?, ?, ?)").run(id, name, token)
      return json({ token, user: name })
    }

    if (path === "/me") return user ? json({ user: user.name, id: user.id }) : err("unauthorized", 401)

    if (path === "/sessions" && req.method === "GET") {
      if (!user) return err("unauthorized", 401)
      const mine = q.mySessions.all(user.id, user.id)
      // a project share key (from .multiclaude.json) also reveals that project's sessions
      const byKey = shareKey ? db.query<Session, [string]>("SELECT * FROM sessions WHERE share_key = ?").all(shareKey) : []
      const seen = new Set<string>()
      const all = [...mine, ...byKey].filter((s) => !seen.has(s.id) && seen.add(s.id))
      all.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
      return json(all.map((s) => withMeta(s, true)))
    }

    if (path === "/sessions" && req.method === "POST") {
      if (!user) return err("unauthorized", 401)
      const body = (await req.json().catch(() => ({}))) as { id?: string; name?: string; adapter?: string; share_key?: string }
      const id = body.id ?? rid()
      const existing = q.session.get(id)
      if (existing) {
        if (!canAccess(existing, user, shareKey)) return err("session id taken", 409)
        return json(withMeta(existing, true))
      }
      db.query("INSERT INTO sessions (id, name, owner, adapter, share_key) VALUES (?, ?, ?, ?, ?)").run(
        id, body.name ?? null, user.id, body.adapter ?? "claude", body.share_key?.trim() || key(),
      )
      return json(withMeta(q.session.get(id)!, true), 201)
    }

    const m = path.match(/^\/sessions\/([^/]+)(?:\/(\w+))?$/)
    if (!m) return err("not found", 404)
    const s = q.session.get(m[1])
    if (!s) return err("session not found", 404)
    const sub = m[2]

    if (sub === "join" && req.method === "POST") {
      if (!user) return err("unauthorized", 401)
      if (!canAccess(s, user, shareKey)) return err("bad share key", 403)
      q.addMember.run(s.id, user.id)
      return json(withMeta(s, true))
    }

    if (!canAccess(s, user, shareKey)) return err("forbidden", 403)
    const isOwner = user?.id === s.owner

    if (sub === "ws") {
      if (!user) return err("unauthorized (ws needs token)", 401)
      const ok = server.upgrade(req, { data: { sessionId: s.id, user } })
      return ok ? undefined : err("upgrade failed", 400)
    }
    if (!sub && req.method === "GET") return json(withMeta(s, isOwner || !!shareKey))
    if (sub === "have" && req.method === "POST") {
      const body = (await req.json()) as { ids: string[] }
      const missing = body.ids.filter((id) => !q.hasEntry.get(s.id, id)!.n)
      return json({ missing })
    }
    if (sub === "entries" && req.method === "GET") {
      const after = Number(url.searchParams.get("after") ?? 0)
      return json({ entries: q.entriesAfter.all(s.id, after), head: q.head.get(s.id)!.head })
    }
    if (sub === "entries" && req.method === "POST") {
      if (!user) return err("unauthorized (push needs token)", 401)
      const body = (await req.json()) as { entries: WireEntry[] }
      const added = addEntries(s.id, user, body.entries ?? [])
      return json({ added: added.length, head: q.head.get(s.id)!.head })
    }
    return err("not found", 404)
  },
  websocket: {
    open(ws) {
      const { sessionId } = ws.data
      if (!rooms.has(sessionId)) rooms.set(sessionId, new Set())
      rooms.get(sessionId)!.add(ws)
      broadcast(sessionId, { type: "presence", user: ws.data.user.name, event: "join", count: rooms.get(sessionId)!.size })
      ws.send(JSON.stringify({ type: "hello", user: ws.data.user.name, head: q.head.get(sessionId)!.head }))
    },
    message(ws, data) {
      let msg: any
      try {
        msg = JSON.parse(String(data))
      } catch {
        return
      }
      const { sessionId, user } = ws.data
      if (msg.type === "entries" && Array.isArray(msg.entries)) {
        const added = addEntries(sessionId, user, msg.entries)
        ws.send(JSON.stringify({ type: "ack", added: added.length, head: q.head.get(sessionId)!.head }))
      } else if (msg.type === "sync") {
        ws.send(JSON.stringify({ type: "entries", entries: q.entriesAfter.all(sessionId, Number(msg.after ?? 0)) }))
      } else if (msg.type === "ping") ws.send(JSON.stringify({ type: "pong" }))
    },
    close(ws) {
      const room = rooms.get(ws.data.sessionId)
      room?.delete(ws)
      if (room) broadcast(ws.data.sessionId, { type: "presence", user: ws.data.user.name, event: "leave", count: room.size })
    },
  },
})

console.log(`multiclaude server listening on http://localhost:${server.port}  (db: ${process.env.MULTICLAUDE_DB ?? "multiclaude.db"})`)
