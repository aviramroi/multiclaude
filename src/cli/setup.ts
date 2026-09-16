import { getAdapter } from "../core/adapters"

const EVENTS = ["SessionStart", "UserPromptSubmit", "Stop", "SessionEnd"] as const

/**
 * Merge multiclaude hooks into a harness' hooks config (Claude Code settings.json or Codex hooks.json —
 * both use the same schema). Idempotent: skips events that already call `mc hook`.
 */
export async function setupHooks(agent: string, mcPath: string) {
  const ad = getAdapter(agent)
  const file = ad.hooksFile()
  const f = Bun.file(file)
  const cfg: any = (await f.exists()) ? await f.json().catch(() => ({})) : {}
  cfg.hooks ??= {}
  const cmd = `${JSON.stringify(mcPath)} hook`
  const added: string[] = []
  for (const ev of EVENTS) {
    const groups: any[] = (cfg.hooks[ev] ??= [])
    const present = groups.some((g) => (g.hooks ?? []).some((h: any) => /\bmc["']? hook\b/.test(h.command ?? "")))
    if (present) continue
    groups.push({ hooks: [{ type: "command", command: cmd, timeout: 20 }] })
    added.push(ev)
  }
  if (added.length) {
    if (await f.exists()) await Bun.write(file + ".bak", await f.text())
    await Bun.write(file, JSON.stringify(cfg, null, 2) + "\n")
  }
  return { file, added }
}
