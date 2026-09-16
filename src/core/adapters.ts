import { homedir } from "node:os"
import { join, basename } from "node:path"
import { readdir, stat, open } from "node:fs/promises"

export interface LocalSession {
  id: string
  path: string
  mtime: number
}

/** Everything that differs between agent harnesses. Transcript *content* is handled in transcript.ts. */
export interface Adapter {
  name: "claude" | "codex"
  /** existing transcript for `id`, or the path a pulled one should be created at */
  sessionPath(cwd: string, id: string): Promise<string>
  listSessions(cwd: string): Promise<LocalSession[]>
  resumeCommand(id: string): string
  /** argv to launch the harness on a session (used by `mc open`) */
  launch(id: string, isNew: boolean): string[]
  /** does this transcript path belong to this harness? (hooks pass transcript_path) */
  owns(transcriptPath: string): boolean
  /** where the harness reads its hooks config */
  hooksFile(): string
}

export const CODEX_HOME = process.env.CODEX_HOME ?? join(homedir(), ".codex")
export const CLAUDE_HOME = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude")

export const claude: Adapter = {
  name: "claude",
  async sessionPath(cwd, id) {
    return join(CLAUDE_HOME, "projects", cwd.replace(/[^a-zA-Z0-9]/g, "-"), `${id}.jsonl`)
  },
  async listSessions(cwd) {
    const dir = join(CLAUDE_HOME, "projects", cwd.replace(/[^a-zA-Z0-9]/g, "-"))
    let names: string[]
    try {
      names = await readdir(dir)
    } catch {
      return []
    }
    const out: LocalSession[] = []
    for (const n of names) {
      if (!n.endsWith(".jsonl")) continue
      const path = join(dir, n)
      out.push({ id: n.slice(0, -6), path, mtime: (await stat(path)).mtimeMs })
    }
    return out.sort((a, b) => b.mtime - a.mtime)
  },
  resumeCommand: (id) => `claude --resume ${id}`,
  launch: (id, isNew) => ["claude", isNew ? "--session-id" : "--resume", id],
  owns: (p) => p.includes(`${CLAUDE_HOME}/`) || /[\\/]\.claude[\\/]projects[\\/]/.test(p),
  hooksFile: () => join(CLAUDE_HOME, "settings.json"),
}

// Codex keeps one global tree: ~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<id>.jsonl.
// The first line (session_meta) carries the cwd; lines have no uuid, so ids are content hashes.
async function codexFiles(): Promise<string[]> {
  const root = join(CODEX_HOME, "sessions")
  const out: string[] = []
  const walk = async (dir: string, depth: number) => {
    let names: string[]
    try {
      names = await readdir(dir)
    } catch {
      return
    }
    for (const n of names) {
      const p = join(dir, n)
      if (n.endsWith(".jsonl")) out.push(p)
      else if (depth < 3) await walk(p, depth + 1)
    }
  }
  await walk(root, 0)
  return out
}

async function codexMetaCwd(path: string): Promise<string | null> {
  // session_meta embeds the full base instructions, so the first line can be 100KB+
  const fh = await open(path, "r")
  try {
    const chunks: Buffer[] = []
    let pos = 0
    for (let i = 0; i < 64; i++) {
      const buf = Buffer.alloc(65536)
      const { bytesRead } = await fh.read(buf, 0, buf.length, pos)
      if (!bytesRead) break
      chunks.push(buf.subarray(0, bytesRead))
      pos += bytesRead
      if (buf.subarray(0, bytesRead).includes(10)) break
    }
    const first = Buffer.concat(chunks).toString("utf8").split("\n")[0]
    const o = JSON.parse(first)
    return o?.payload?.cwd ?? null
  } catch {
    return null
  } finally {
    await fh.close()
  }
}

export const codex: Adapter = {
  name: "codex",
  async sessionPath(_cwd, id) {
    const hit = (await codexFiles()).find((p) => basename(p).endsWith(`-${id}.jsonl`))
    if (hit) return hit
    const now = new Date()
    const d = now.toISOString()
    const day = join(CODEX_HOME, "sessions", d.slice(0, 4), d.slice(5, 7), d.slice(8, 10))
    return join(day, `rollout-${d.slice(0, 19).replace(/:/g, "-")}-${id}.jsonl`)
  },
  async listSessions(cwd) {
    const out: LocalSession[] = []
    for (const path of await codexFiles()) {
      if ((await codexMetaCwd(path)) !== cwd) continue
      const m = basename(path).match(/-([0-9a-f-]{36})\.jsonl$/)
      if (!m) continue
      out.push({ id: m[1], path, mtime: (await stat(path)).mtimeMs })
    }
    return out.sort((a, b) => b.mtime - a.mtime)
  },
  resumeCommand: (id) => `codex resume ${id}`,
  launch: (id, isNew) => (isNew ? ["codex"] : ["codex", "resume", id]),
  owns: (p) => p.includes(`${CODEX_HOME}/`) || /[\\/]\.codex[\\/]sessions[\\/]/.test(p),
  hooksFile: () => join(CODEX_HOME, "hooks.json"),
}

export const adapters: Record<string, Adapter> = { claude, codex }

export function getAdapter(name = "claude"): Adapter {
  const a = adapters[name]
  if (!a) throw new Error(`unknown adapter: ${name} (claude|codex)`)
  return a
}

export function detectAdapter(transcriptPath: string): Adapter {
  return codex.owns(transcriptPath) ? codex : claude
}
