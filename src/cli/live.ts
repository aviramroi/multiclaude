import { watch } from "node:fs"
import { stat, open } from "node:fs/promises"
import { client, track, tracked } from "./sync"
import { appendLines, localize, parseLine, summarize, type WireEntry } from "../core/transcript"

const c = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
}

export function printEntry(e: WireEntry) {
  const s = summarize(e.raw, 400)
  if (!s) return
  const who = e.author ? c.dim(`@${e.author} `) : ""
  const role = s.role === "user" ? c.cyan("you  ▸") : c.green("claude▸")
  console.log(`${who}${role} ${s.text}`)
}

/**
 * Live mode: keep a local transcript and the remote in sync in both directions.
 * Local appends (from the running Claude Code) stream up; remote entries stream
 * down and are appended to the same file so `claude --resume` sees everything.
 */
export async function live(opts: { id: string; path: string; cwd: string; readonly?: boolean; remote?: string }) {
  const { api, cfg } = await client(opts.remote)
  const t = await tracked(opts.id)
  const seen = new Set<string>() // ids already in the local file (avoid echo loops)
  let offset = 0

  const fileExists = await Bun.file(opts.path).exists()
  if (fileExists) {
    const text = await Bun.file(opts.path).text()
    offset = Buffer.byteLength(text)
    for (const line of text.split("\n")) {
      const e = parseLine(line)
      if (e) seen.add(e.id)
    }
  }

  let ws: WebSocket | null = null
  let cursor = t?.cursor ?? 0
  let pending = ""
  const useWs = await api.supportsWs(opts.id)

  /** apply entries that arrived from the remote (either transport) */
  const applyRemote = async (entries: WireEntry[]) => {
    const fresh = entries.filter((e) => !seen.has(e.id))
    for (const e of fresh) seen.add(e.id)
    if (fresh.length && !opts.readonly) {
      await appendLines(opts.path, fresh.map((e) => localize(e.raw, opts.cwd, opts.id)))
      offset = (await stat(opts.path)).size // we wrote it; don't re-ship it
    }
    for (const e of fresh) if (e.author !== cfg.user || opts.readonly) printEntry(e)
    const head = Math.max(cursor, ...entries.map((e) => e.seq ?? 0))
    if (head !== cursor) {
      cursor = head
      await track(opts.id, { cursor })
    }
  }

  /** long-poll transport for hosts without WebSockets (Vercel) */
  const pollLoop = async () => {
    console.log(c.dim(`● live ${opts.readonly ? "(watch)" : ""} ${opts.id} as @${cfg.user} — long polling, ctrl-c to stop`))
    for (;;) {
      try {
        const { entries } = await api.pullEntries(opts.id, cursor, 25)
        await applyRemote(entries)
      } catch (e) {
        console.log(c.dim(`● poll error: ${(e as Error).message}; retrying`))
        await new Promise((r) => setTimeout(r, 2000))
      }
    }
  }
  const ship = async (out: WireEntry[]) => {
    if (useWs) {
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "entries", entries: out }))
      else for (const e of out) seen.delete(e.id) // retry on next drain
    } else {
      await api.pushEntries(opts.id, out).catch(() => { for (const e of out) seen.delete(e.id) })
    }
  }

  const connect = () => {
    const sock = new WebSocket(api.wsUrl(opts.id, cursor))
    ws = sock
    sock.onopen = () => {
      console.log(c.dim(`● live ${opts.readonly ? "(watch)" : ""} ${opts.id} as @${cfg.user} — ctrl-c to stop`))
      sock.send(JSON.stringify({ type: "sync", after: cursor }))
      if (!opts.readonly) void drainLocal()
    }
    sock.onmessage = async (ev) => {
      const msg = JSON.parse(String(ev.data))
      if (msg.type === "entries") await applyRemote(msg.entries)
      else if (msg.type === "presence") {
        console.log(c.yellow(`◦ @${msg.user} ${msg.event === "join" ? "joined" : "left"} (${msg.count} online)`))
      }
    }
    sock.onclose = () => {
      console.log(c.dim("● disconnected, retrying in 2s"))
      setTimeout(connect, 2000)
    }
    sock.onerror = () => {}
  }

  /** Read bytes appended locally since `offset` and ship complete lines. */
  const drainLocal = async () => {
    if (opts.readonly) return
    let s
    try {
      s = await stat(opts.path)
    } catch {
      return
    }
    if (s.size < offset) offset = 0 // truncated/rewritten
    if (s.size === offset) return
    const fh = await open(opts.path, "r")
    const buf = Buffer.alloc(s.size - offset)
    await fh.read(buf, 0, buf.length, offset)
    await fh.close()
    offset = s.size
    pending += buf.toString("utf8")
    const lines = pending.split("\n")
    pending = lines.pop() ?? ""
    const out: WireEntry[] = []
    for (const line of lines) {
      const e = parseLine(line)
      if (e && !seen.has(e.id)) {
        seen.add(e.id)
        out.push(e)
      }
    }
    if (out.length) await ship(out)
  }

  if (useWs) connect()
  else void pollLoop()
  if (!opts.readonly) {
    // fs.watch can miss events on some platforms; poll as a safety net.
    try {
      watch(opts.path, () => void drainLocal())
    } catch {}
    setInterval(() => void drainLocal(), 500)
  }
  if (useWs) setInterval(() => ws?.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ type: "ping" })), 25000)
  await new Promise(() => {})
}
