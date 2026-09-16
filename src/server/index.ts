// Bun entrypoint: HTTP app + WebSocket rooms (live mode). Storage: SQLite by default, Postgres if DATABASE_URL is set.
import type { ServerWebSocket } from "bun"
import { createApp } from "./app"
import { sqliteStore } from "./store-sqlite"
import type { User, StoredEntry } from "./store"

const PORT = Number(process.env.PORT ?? 4747)
// MULTICLAUDE_DB (a file path) wins over DATABASE_URL, so local dev/tests stay on SQLite even with .env.local present
const usePg = !!process.env.DATABASE_URL && !process.env.MULTICLAUDE_DB
const store = usePg ? (await import("./store-pg")).pgStore(process.env.DATABASE_URL!) : sqliteStore(process.env.MULTICLAUDE_DB ?? "multiclaude.db")

type WsData = { sessionId: string; user: User }
const rooms = new Map<string, Set<ServerWebSocket<WsData>>>()
const broadcast = (sessionId: string, msg: unknown, except?: ServerWebSocket<WsData>) => {
  const payload = JSON.stringify(msg)
  for (const ws of rooms.get(sessionId) ?? []) if (ws !== except) ws.send(payload)
}

let serverRef: ReturnType<typeof Bun.serve<WsData>>
const app = createApp({
  store,
  publicUrl: process.env.PUBLIC_URL,
  onEntries: (sid, entries: StoredEntry[]) => broadcast(sid, { type: "entries", entries }),
  upgrade: (req, data) => (serverRef.upgrade(req, { data }) ? undefined : new Response("upgrade failed", { status: 400 })),
})

serverRef = Bun.serve<WsData>({
  port: PORT,
  idleTimeout: 60,
  fetch: (req) => app.fetch(req),
  websocket: {
    async open(ws) {
      const { sessionId } = ws.data
      if (!rooms.has(sessionId)) rooms.set(sessionId, new Set())
      rooms.get(sessionId)!.add(ws)
      broadcast(sessionId, { type: "presence", user: ws.data.user.name, event: "join", count: rooms.get(sessionId)!.size })
      ws.send(JSON.stringify({ type: "hello", user: ws.data.user.name, head: (await store.head(sessionId)).head }))
    },
    async message(ws, data) {
      let msg: any
      try {
        msg = JSON.parse(String(data))
      } catch {
        return
      }
      const { sessionId, user } = ws.data
      if (msg.type === "entries" && Array.isArray(msg.entries)) {
        const added = await app.addEntries(sessionId, user, msg.entries)
        ws.send(JSON.stringify({ type: "ack", added: added.length, head: (await store.head(sessionId)).head }))
      } else if (msg.type === "sync") {
        ws.send(JSON.stringify({ type: "entries", entries: await store.entriesAfter(sessionId, Number(msg.after ?? 0)) }))
      } else if (msg.type === "ping") ws.send(JSON.stringify({ type: "pong" }))
    },
    close(ws) {
      const room = rooms.get(ws.data.sessionId)
      room?.delete(ws)
      if (room) broadcast(ws.data.sessionId, { type: "presence", user: ws.data.user.name, event: "leave", count: room.size })
    },
  },
})

console.log(`multiclaude server on http://localhost:${serverRef.port} (${usePg ? "postgres" : "sqlite"})`)
