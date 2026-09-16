import { homedir } from "node:os"
import { join } from "node:path"
import { mkdir } from "node:fs/promises"

export const CONFIG_DIR = process.env.MULTICLAUDE_HOME ?? join(homedir(), ".multiclaude")
const CONFIG_PATH = join(CONFIG_DIR, "config.json")
const STATE_PATH = join(CONFIG_DIR, "state.json")

export const HOSTED_REMOTE = "https://multiclaude.fly.dev"
export const DEFAULT_REMOTE = process.env.MULTICLAUDE_REMOTE ?? HOSTED_REMOTE

export interface Config {
  remote: string
  token?: string
  user?: string
  /** push every session on Stop, not just linked ones */
  autoPushAll?: boolean
}

export interface TrackedSession {
  remote: string
  shareKey?: string
  cursor: number // last server seq we have applied locally
  linked: boolean // auto push/pull via hooks
  cwd: string
  name?: string
  adapter?: string // claude | codex
}

export interface State {
  sessions: Record<string, TrackedSession>
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  const f = Bun.file(path)
  if (!(await f.exists())) return fallback
  try {
    return { ...fallback, ...(await f.json()) }
  } catch {
    return fallback
  }
}

async function writeJson(path: string, data: unknown) {
  await mkdir(CONFIG_DIR, { recursive: true })
  await Bun.write(path, JSON.stringify(data, null, 2) + "\n")
}

export const loadConfig = () => readJson<Config>(CONFIG_PATH, { remote: DEFAULT_REMOTE })
export const saveConfig = (c: Config) => writeJson(CONFIG_PATH, c)
export const loadState = () => readJson<State>(STATE_PATH, { sessions: {} })
export const saveState = (s: State) => writeJson(STATE_PATH, s)
