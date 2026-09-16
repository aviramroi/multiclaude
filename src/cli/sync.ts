import { mkdir } from "node:fs/promises"
import { userInfo } from "node:os"
import { Client } from "../core/client"
import { loadConfig, saveConfig, loadState, saveState, type TrackedSession } from "../core/config"
import { getAdapter, detectAdapter } from "../core/adapters"
import { dirname } from "node:path"
import { appendLines, leaves, localize, readTranscript, type Entry, type WireEntry } from "../core/transcript"

/** Authenticated client; registers a token on first use so `mc push` just works. */
export async function client(remote?: string) {
  const cfg = await loadConfig()
  const base = remote ?? cfg.remote
  if (!cfg.token) {
    const name = process.env.MULTICLAUDE_USER ?? userInfo().username
    const r = await new Client(base).register(name)
    cfg.token = r.token
    cfg.user = r.user
    cfg.remote = base
    await saveConfig(cfg)
    console.error(`mc: registered as "${name}" on ${base}`)
    if (r.claim_url) console.error(`mc: approve this machine at ${r.claim_url}`)
  }
  return { cfg, api: new Client(base, cfg.token) }
}

export async function track(id: string, patch: Partial<TrackedSession>): Promise<TrackedSession> {
  const state = await loadState()
  const cur = state.sessions[id] ?? { remote: "", cursor: 0, linked: false, cwd: process.cwd() }
  state.sessions[id] = { ...cur, ...patch }
  await saveState(state)
  return state.sessions[id]
}

export async function tracked(id: string) {
  return (await loadState()).sessions[id]
}

/** Resolve "latest" / name / prefix → full session id (local state first, then the remote by name). */
export async function resolveLocal(cwd: string, ref?: string, adapterName = "claude", remote?: { url?: string; shareKey?: string }): Promise<string> {
  const adapter = getAdapter(adapterName)
  const sessions = await adapter.listSessions(cwd)
  if (!ref || ref === "latest") {
    if (!sessions.length) throw new Error(`no ${adapter.name} sessions found for ${cwd}`)
    return sessions[0].id
  }
  const state = await loadState()
  const byName = Object.entries(state.sessions).find(([, t]) => t.name === ref)
  if (byName) return byName[0]
  const hit = sessions.filter((s) => s.id.startsWith(ref))
  if (hit.length === 1) return hit[0].id
  if (hit.length > 1) throw new Error(`ambiguous session prefix: ${ref}`)
  if (/^[0-9a-f-]{36}$/.test(ref)) return ref
  // a teammate's session named at push time: look it up on the remote
  const { api } = await client(remote?.url)
  const list = await api.listSessions(remote?.shareKey).catch(() => [])
  const byRemoteName = list.filter((s) => s.name === ref || s.id.startsWith(ref))
  if (byRemoteName.length === 1) return byRemoteName[0].id
  if (byRemoteName.length > 1) throw new Error(`ambiguous session ref: ${ref}`)
  return ref
}

export interface PushResult { added: number; head: number; total: number; diverged: boolean }

export async function push(opts: {
  id: string
  transcriptPath: string
  name?: string
  remote?: string
  cwd?: string
  link?: boolean
  quiet?: boolean
  shareKey?: string
  adapter?: string
}): Promise<PushResult> {
  const { api } = await client(opts.remote)
  const agent = opts.adapter ?? detectAdapter(opts.transcriptPath).name
  const entries = await readTranscript(opts.transcriptPath)
  const t = await tracked(opts.id)
  const session = await api.createSession(opts.id, opts.name ?? t?.name, agent, opts.shareKey ?? t?.shareKey).catch(async (e) => {
    if (String(e).includes("409")) throw new Error(`session ${opts.id} exists remotely and you have no access`)
    throw e
  })
  const { missing } = await api.have(opts.id, entries.map((e) => e.id))
  const missingSet = new Set(missing)
  const toSend: WireEntry[] = entries.filter((e) => missingSet.has(e.id))
  let added = 0
  let head = session.head
  for (let i = 0; i < toSend.length; i += 200) {
    const r = await api.pushEntries(opts.id, toSend.slice(i, i + 200))
    added += r.added
    head = r.head
  }
  await track(opts.id, {
    remote: api.base,
    shareKey: session.share_key ?? t?.shareKey,
    cwd: opts.cwd ?? t?.cwd ?? process.cwd(),
    name: opts.name ?? t?.name ?? session.name ?? undefined,
    adapter: agent,
    ...(opts.link !== undefined ? { linked: opts.link } : {}),
    // if nothing new arrived from others our cursor is the head
    ...(t ? {} : { cursor: head }),
  })
  return { added, head, total: entries.length, diverged: leaves(entries).length > 1 }
}

export interface PullResult { added: number; head: number; newEntries: Entry[]; diverged: boolean; path: string; adapter: string }

export async function pull(opts: {
  id: string
  cwd: string
  remote?: string
  shareKey?: string
  adapter?: string
  link?: boolean
}): Promise<PullResult> {
  const { api } = await client(opts.remote)
  const t = await tracked(opts.id)
  const key = opts.shareKey ?? t?.shareKey
  if (key) await api.join(opts.id, key).catch(() => {})
  const info = await api.getSession(opts.id, key)
  const adapter = getAdapter(opts.adapter ?? info.adapter ?? t?.adapter ?? "claude")
  const path = await adapter.sessionPath(opts.cwd, opts.id)
  const local = await readTranscript(path)
  const localIds = new Set(local.map((e) => e.id))
  // Cursor is an optimisation; ids are the source of truth so a reset cursor is safe.
  const { entries, head } = await api.pullEntries(opts.id, t?.cursor ?? 0)
  const fresh = entries.filter((e) => !localIds.has(e.id))
  await mkdir(dirname(path), { recursive: true })
  await appendLines(path, fresh.map((e) => localize(e.raw, opts.cwd, opts.id)))
  await track(opts.id, {
    adapter: adapter.name,
    remote: api.base,
    cursor: head,
    cwd: opts.cwd,
    shareKey: key ?? info.share_key,
    name: info.name ?? t?.name,
    ...(opts.link !== undefined ? { linked: opts.link } : {}),
  })
  const all = await readTranscript(path)
  return { added: fresh.length, head, newEntries: fresh, diverged: leaves(all).length > 1, path, adapter: adapter.name }
}
