import { homedir } from "node:os"
import { join } from "node:path"
import { readdir, stat } from "node:fs/promises"

export interface LocalSession {
  id: string
  path: string
  mtime: number
}

/** Everything that differs between agent harnesses (Claude Code today, Codex next). */
export interface Adapter {
  name: string
  projectDir(cwd: string): string
  sessionPath(cwd: string, id: string): string
  listSessions(cwd: string): Promise<LocalSession[]>
  resumeCommand(id: string): string
}

export const claude: Adapter = {
  name: "claude",
  projectDir(cwd) {
    return join(homedir(), ".claude", "projects", cwd.replace(/[^a-zA-Z0-9]/g, "-"))
  },
  sessionPath(cwd, id) {
    return join(this.projectDir(cwd), `${id}.jsonl`)
  },
  async listSessions(cwd) {
    const dir = this.projectDir(cwd)
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
      const s = await stat(path)
      out.push({ id: n.slice(0, -6), path, mtime: s.mtimeMs })
    }
    return out.sort((a, b) => b.mtime - a.mtime)
  },
  resumeCommand(id) {
    return `claude --resume ${id}`
  },
}

// Codex stores rollouts under ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl.
// Listing works; resume wiring lands with the Codex milestone.
export const codex: Adapter = {
  name: "codex",
  projectDir() {
    return join(homedir(), ".codex", "sessions")
  },
  sessionPath(_cwd, id) {
    return join(this.projectDir(""), `${id}.jsonl`)
  },
  async listSessions() {
    return []
  },
  resumeCommand(id) {
    return `codex resume ${id}`
  },
}

export const adapters: Record<string, Adapter> = { claude, codex }

export function getAdapter(name = "claude"): Adapter {
  const a = adapters[name]
  if (!a) throw new Error(`unknown adapter: ${name}`)
  return a
}
