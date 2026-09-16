import { join, dirname, resolve } from "node:path"
import { homedir } from "node:os"

/**
 * Per-project config, committed alongside the code so every teammate's hooks
 * pick it up automatically: `mc init` writes it, the plugin hooks read it.
 */
export interface ProjectConfig {
  remote: string
  /** "turn": push on Stop, pull on start/prompt. "live": also run a live daemon. "off": hooks ignore. */
  mode: "turn" | "live" | "off"
  /** share every session started in this project (not only `mc link`ed ones) */
  shareAll: boolean
  /** inject a compact summary of new remote turns into Claude's context (costs a few tokens) */
  inject: boolean
  /** default share key so teammates can pull sessions they did not create */
  shareKey?: string
  /** default harness for mc open/push in this project (hooks detect it automatically) */
  agent?: "claude" | "codex"
}

export const PROJECT_FILE = ".multiclaude.json"

/** Folders where a project config would capture far too much: never treat these as a shared project. */
export function isTooBroad(dir: string): boolean {
  const d = resolve(dir)
  const home = resolve(homedir())
  return d === home || d === "/" || d === dirname(home) || d === "/Users" || d === "/home"
}

export async function findProjectConfig(cwd: string): Promise<{ path: string; cfg: ProjectConfig } | null> {
  let dir = cwd
  for (;;) {
    if (isTooBroad(dir)) return null // a config in ~ or / is ignored, so one file can't share everything
    const path = join(dir, PROJECT_FILE)
    const f = Bun.file(path)
    if (await f.exists()) {
      try {
        return { path, cfg: { mode: "turn", shareAll: true, inject: true, ...(await f.json()) } }
      } catch {
        return null
      }
    }
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

export async function writeProjectConfig(cwd: string, cfg: ProjectConfig) {
  const path = join(cwd, PROJECT_FILE)
  await Bun.write(path, JSON.stringify(cfg, null, 2) + "\n")
  return path
}
