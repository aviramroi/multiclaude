import { join } from "node:path"
import { mkdir, readFile, unlink } from "node:fs/promises"
import { CONFIG_DIR } from "../core/config"

const DIR = join(CONFIG_DIR, "live")
const pidFile = (id: string) => join(DIR, `${id}.pid`)

function alive(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/** Start `mc live <id>` detached (idempotent per session). Returns the pid. */
export async function startLiveDaemon(id: string, cwd: string, remote?: string): Promise<number> {
  await mkdir(DIR, { recursive: true })
  const existing = await readFile(pidFile(id), "utf8").catch(() => "")
  if (existing && alive(Number(existing))) return Number(existing)
  const log = Bun.file(join(DIR, `${id}.log`))
  const proc = Bun.spawn(
    [process.execPath, "run", join(import.meta.dir, "index.ts"), "live", id, "--cwd", cwd, ...(remote ? ["--remote", remote] : [])],
    { cwd, stdio: ["ignore", log, log], detached: true } as any,
  )
  proc.unref()
  await Bun.write(pidFile(id), String(proc.pid))
  return proc.pid
}

export async function stopLiveDaemon(id: string): Promise<boolean> {
  const pid = Number(await readFile(pidFile(id), "utf8").catch(() => "0"))
  await unlink(pidFile(id)).catch(() => {})
  if (!pid || !alive(pid)) return false
  try {
    process.kill(pid, "SIGTERM")
    return true
  } catch {
    return false
  }
}

export async function liveDaemonPid(id: string): Promise<number | null> {
  const pid = Number(await readFile(pidFile(id), "utf8").catch(() => "0"))
  return pid && alive(pid) ? pid : null
}
