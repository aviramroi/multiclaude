#!/usr/bin/env bun
import { parseArgs } from "node:util"
import { basename } from "node:path"
import { getAdapter, detectAdapter, adapters } from "../core/adapters"
import { loadConfig, saveConfig, loadState, saveState } from "../core/config"
import { Client } from "../core/client"
import { leaves, readTranscript, summarize } from "../core/transcript"
import { client, pull, push, resolveLocal, tracked, track } from "./sync"
import { live, printEntry } from "./live"
import { findProjectConfig, writeProjectConfig, PROJECT_FILE, type ProjectConfig } from "../core/project"
import { startLiveDaemon, stopLiveDaemon, liveDaemonPid } from "./daemon"
import { setupHooks } from "./setup"

const HELP = `mc — multiclaude: git-style sync + live multiplayer for Claude Code sessions

  mc login [url] [--token T] [--name N]   set remote (default http://localhost:4747), register/auth
  mc whoami                               machine identity + approval status
  mc init [--mode turn|live|off]          share every session in this folder; prints an invite link
  mc join <invite-link>                   join a teammate's shared project in this folder (no git needed)
  mc invite                               print this folder's invite link again
  mc open <name|id> | mc open --new <name>  pull → claude --resume → (live daemon) → push on exit
  mc push [session] [--name N] [--link]   push a local session (default: latest in this cwd)
  mc pull <session> [--key K] [--link]    pull a remote session into this cwd's Claude project
  mc clone <url|id> [--key K]             pull + print the resume command
  mc share <session>                      print the clone command a teammate needs
  mc link <session> / mc unlink <session> auto push on Stop / auto pull on SessionStart
  mc live [session]                       two-way real-time sync of this session (multiplayer)
  mc watch <session>                      read-only live view of a session
  mc log <session>                        print the transcript
  mc status [session]                     local vs remote state, divergence
  mc ls [--local]                         remote sessions you can access (or local ones)
  mc hook                                 (internal) handler for Claude Code hooks, reads stdin JSON
  mc daemon stop <session>                stop a background live daemon

  mc setup claude|codex                   merge multiclaude hooks into ~/.claude/settings.json or ~/.codex/hooks.json

  refs: full id, unique prefix, name given at push, or "latest"
  --agent claude|codex  pick the harness (default from .multiclaude.json "agent", else claude)
  env:  MULTICLAUDE_REMOTE, MULTICLAUDE_HOME, MULTICLAUDE_USER
`

const { values: flags, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  allowPositionals: true,
  options: {
    token: { type: "string" },
    name: { type: "string" },
    key: { type: "string" },
    remote: { type: "string" },
    link: { type: "boolean" },
    local: { type: "boolean" },
    cwd: { type: "string" },
    json: { type: "boolean" },
    mode: { type: "string" },
    new: { type: "string" },
    "no-inject": { type: "boolean" },
    agent: { type: "string" },
    help: { type: "boolean", short: "h" },
  },
})

const [cmd, ...args] = positionals
const cwd = flags.cwd ?? process.cwd()

function inviteLink(pc: ProjectConfig) {
  const u = new URL(`${pc.remote}/j/${pc.shareKey}`)
  if (pc.mode === "live") u.searchParams.set("mode", "live")
  if (pc.agent) u.searchParams.set("agent", pc.agent)
  return u.toString()
}

function parseSessionRef(ref: string): { id: string; remote?: string; key?: string } {
  // mc clone https://host/sessions/<id>?key=K   or   https://host/s/<id>#K   or   <id>
  if (/^https?:\/\//.test(ref)) {
    const u = new URL(ref)
    const id = basename(u.pathname)
    const key = u.searchParams.get("key") ?? (u.hash ? u.hash.slice(1) : undefined) ?? undefined
    return { id, remote: u.origin, key }
  }
  return { id: ref }
}

async function main() {
  if (!cmd || flags.help) return console.log(HELP)
  // .multiclaude.json (if any) supplies remote + share key defaults for every command
  const proj = await findProjectConfig(cwd)
  const pRemote = flags.remote ?? proj?.cfg.remote
  const pKey = flags.key ?? proj?.cfg.shareKey
  const agentName = flags.agent ?? proj?.cfg.agent ?? "claude"
  const adapter = getAdapter(agentName)

  switch (cmd) {
    case "login": {
      const cfg = await loadConfig()
      if (args[0]) cfg.remote = args[0].replace(/\/$/, "")
      if (flags.token) cfg.token = flags.token
      const probe = new Client(cfg.remote, cfg.token)
      if (cfg.token) {
        const me = await probe.me()
        cfg.user = me.user
      } else {
        const name = flags.name ?? process.env.MULTICLAUDE_USER ?? (await import("node:os")).userInfo().username
        const r = await probe.register(name)
        cfg.token = r.token
        cfg.user = r.user
      }
      await saveConfig(cfg)
      console.log(`logged in to ${cfg.remote} as @${cfg.user}`)
      const me = await new Client(cfg.remote, cfg.token).me().catch(() => null)
      if (me && !me.claimed && me.claim_url) {
        console.log(`\nAPPROVAL NEEDED — open this link to approve the account for this machine:\n  ${me.claim_url}\n`)
      } else if (me?.email) console.log(`approved by ${me.email}`)
      console.log(`token: ${cfg.token}  (reuse with: mc login ${cfg.remote} --token …)`)
      return
    }

    case "whoami": {
      const { cfg, api } = await client(flags.remote)
      const me = await api.me()
      console.log(`@${me.user} on ${cfg.remote}${me.email ? ` — approved by ${me.email}` : ` — NOT approved yet: ${me.claim_url}`}`)
      return
    }

    case "push": {
      const id = await resolveLocal(cwd, args[0], agentName, { url: pRemote, shareKey: pKey })
      const path = await adapter.sessionPath(cwd, id)
      const r = await push({ id, transcriptPath: path, name: flags.name, remote: pRemote, cwd, link: flags.link, shareKey: pKey, adapter: agentName })
      const t = await tracked(id)
      console.log(`pushed ${r.added} new / ${r.total} entries → ${t?.remote}/sessions/${id} (head ${r.head})`)
      if (r.diverged) console.log("⚠ session has diverged branches; the latest leaf wins on resume")
      if (t?.shareKey) console.log(`share: mc clone ${t.remote}/sessions/${id}?key=${t.shareKey}`)
      return
    }

    case "pull": {
      if (!args[0]) throw new Error("usage: mc pull <session>")
      const ref = parseSessionRef(args[0])
      const id = await resolveLocal(cwd, ref.id, agentName, { url: pRemote, shareKey: pKey })
      const r = await pull({ id, cwd, remote: ref.remote ?? pRemote, shareKey: ref.key ?? pKey, link: flags.link, adapter: flags.agent })
      console.log(`pulled ${r.added} new entries → ${r.path} (head ${r.head})`)
      if (r.diverged) console.log("⚠ diverged branches present")
      console.log(`resume: ${getAdapter(r.adapter).resumeCommand(id)}`)
      return
    }

    case "clone": {
      if (!args[0]) throw new Error("usage: mc clone <url|id> [--key K]")
      const ref = parseSessionRef(args[0])
      const r = await pull({ id: ref.id, cwd, remote: ref.remote ?? pRemote, shareKey: ref.key ?? pKey, link: flags.link ?? true, adapter: flags.agent })
      console.log(`cloned ${r.added} entries → ${r.path}`)
      console.log(`\n  ${getAdapter(r.adapter).resumeCommand(ref.id)}\n`)
      return
    }

    case "share": {
      const id = await resolveLocal(cwd, args[0], agentName, { url: pRemote, shareKey: pKey })
      let t = await tracked(id)
      if (!t?.shareKey) {
        const { api } = await client(pRemote)
        const s = await api.getSession(id, pKey)
        t = await track(id, { shareKey: s.share_key, remote: api.base })
      }
      console.log(`mc clone ${t.remote}/sessions/${id}?key=${t.shareKey}`)
      return
    }

    case "link":
    case "unlink": {
      const id = await resolveLocal(cwd, args[0], agentName, { url: pRemote, shareKey: pKey })
      await track(id, { linked: cmd === "link", cwd })
      console.log(`${cmd}ed ${id}${cmd === "link" ? " — hooks will auto push on Stop / pull on SessionStart" : ""}`)
      return
    }

    case "live": {
      const id = await resolveLocal(cwd, args[0], agentName, { url: pRemote, shareKey: pKey })
      let path = await adapter.sessionPath(cwd, id)
      const t = await tracked(id)
      if (!t) {
        // first time: make sure the remote has it
        if (await Bun.file(path).exists()) await push({ id, transcriptPath: path, remote: pRemote, cwd, shareKey: pKey, adapter: agentName })
        else path = (await pull({ id, cwd, remote: pRemote, shareKey: pKey })).path
      } else path = await getAdapter(t.adapter ?? agentName).sessionPath(cwd, id)
      await live({ id, path, cwd, remote: pRemote })
      return
    }

    case "watch": {
      if (!args[0]) throw new Error("usage: mc watch <session>")
      const ref = parseSessionRef(args[0])
      const { api } = await client(ref.remote ?? pRemote)
      if (ref.key ?? pKey) await api.join(ref.id, (ref.key ?? pKey)!)
      const { entries } = await api.pullEntries(ref.id, 0)
      for (const e of entries) printEntry(e)
      await track(ref.id, { cursor: Math.max(0, ...entries.map((e) => e.seq ?? 0)), remote: api.base })
      await live({ id: ref.id, path: "", cwd, readonly: true, remote: api.base })
      return
    }

    case "log": {
      const id = await resolveLocal(cwd, args[0], agentName, { url: pRemote, shareKey: pKey })
      const ad = getAdapter((await tracked(id))?.adapter ?? agentName)
      const entries = await readTranscript(await ad.sessionPath(cwd, id))
      for (const e of entries) {
        const s = summarize(e.raw, 400)
        if (s) console.log(`${s.role === "user" ? "you   ▸" : "claude▸"} ${s.text}`)
      }
      return
    }

    case "status": {
      const id = await resolveLocal(cwd, args[0], agentName, { url: pRemote, shareKey: pKey })
      const t = await tracked(id)
      const ad = getAdapter(t?.adapter ?? agentName)
      const path = await ad.sessionPath(cwd, id)
      const entries = await readTranscript(path)
      const lv = leaves(entries)
      const shape = lv.length === 0 ? "linear log" : lv.length === 1 ? "1 leaf" : `${lv.length} leaves ⚠ diverged`
      console.log(`session  ${id}${t?.name ? ` (${t.name})` : ""}  [${ad.name}]`)
      console.log(`local    ${entries.length} entries, ${shape}  ${path}`)
      if (!t) return console.log("remote   not tracked (run: mc push)")
      const { api } = await client(t.remote)
      const s = await api.getSession(id, t.shareKey ?? pKey)
      const { missing } = await api.have(id, entries.map((e) => e.id))
      const localIds = new Set(entries.map((e) => e.id))
      const behind = (await api.pullEntries(id, 0)).entries.filter((e) => !localIds.has(e.id)).length
      console.log(`remote   ${s.entries} entries  ${t.remote}`)
      console.log(`         ahead ${missing.length} (unpushed)  behind ${behind} (unpulled)`)
      console.log(`linked   ${t.linked ? "yes (auto sync via hooks)" : "no"}`)
      return
    }

    case "ls": {
      if (flags.local) {
        const state = await loadState()
        for (const ad of flags.agent ? [adapter] : Object.values(adapters))
          for (const s of await ad.listSessions(cwd)) {
            const t = state.sessions[s.id]
            console.log(`${s.id}  ${ad.name.padEnd(6)}  ${new Date(s.mtime).toISOString().slice(0, 16)}  ${t ? (t.linked ? "linked" : "tracked") : ""} ${t?.name ?? ""}`)
          }
        return
      }
      const { api } = await client(pRemote)
      const list = await api.listSessions(pKey)
      if (flags.json) return console.log(JSON.stringify(list, null, 2))
      for (const s of list) console.log(`${s.id}  ${s.adapter.padEnd(6)}  ${String(s.entries).padStart(5)} entries  ${s.updated_at}  ${s.name ?? ""}`)
      return
    }

    case "init": {
      const { cfg } = await client(flags.remote)
      const existing = proj?.cfg
      const mode = (flags.mode as ProjectConfig["mode"]) ?? existing?.mode ?? "turn"
      const pc: ProjectConfig = {
        remote: flags.remote ?? existing?.remote ?? cfg.remote,
        mode,
        shareAll: true,
        inject: flags["no-inject"] ? false : existing?.inject ?? true,
        shareKey: existing?.shareKey ?? crypto.randomUUID().replace(/-/g, "").slice(0, 20),
        ...(flags.agent || existing?.agent ? { agent: (flags.agent ?? existing?.agent) as "claude" | "codex" } : {}),
      }
      const path = await writeProjectConfig(cwd, pc)
      console.log(`shared: every ${pc.agent ?? "claude/codex"} session started in ${cwd} now syncs via hooks (${mode} mode).`)
      console.log(`invite teammates (they paste it to their agent, or run mc join):\n  ${inviteLink(pc)}`)
      console.log(`(config: ${path})`)
      return
    }

    case "invite": {
      if (!proj) throw new Error("this folder is not shared yet — run: mc init")
      console.log(inviteLink(proj.cfg))
      return
    }

    case "join": {
      if (!args[0]) throw new Error("usage: mc join <invite-link>")
      const u = new URL(args[0])
      const m = u.pathname.match(/^\/j\/([A-Za-z0-9]{8,64})$/)
      if (!m) throw new Error("not an invite link (expected …/j/<key>)")
      const pc: ProjectConfig = {
        remote: u.origin,
        mode: u.searchParams.get("mode") === "live" ? "live" : "turn",
        shareAll: true,
        inject: true,
        shareKey: m[1],
        ...(u.searchParams.get("agent") ? { agent: u.searchParams.get("agent") as "claude" | "codex" } : {}),
      }
      await writeProjectConfig(cwd, pc)
      const { api } = await client(pc.remote)
      const list = await api.listSessions(pc.shareKey)
      console.log(`joined — sessions started in ${cwd} now sync with the team (${pc.mode} mode).`)
      console.log(list.length ? `${list.length} shared session(s) available: mc ls · mc open <name|id>` : "no sessions yet; start claude or codex here and they'll appear for everyone.")
      return
    }

    case "open": {
      const remote = pRemote
      let id: string
      let ad = adapter
      if (flags.new) {
        if (ad.name === "codex") {
          // Codex picks its own session id; hooks (mc setup codex) share it as soon as it starts.
          console.log(`starting a new codex session in ${cwd}; hooks will share it (name it later with mc push --name)`)
          const proc = Bun.spawn(ad.launch("", true), { cwd, stdio: ["inherit", "inherit", "inherit"] })
          await proc.exited
          return
        }
        id = crypto.randomUUID()
        await track(id, { linked: true, cwd, name: flags.new, remote: remote ?? (await client(remote)).api.base, adapter: ad.name })
        const { api } = await client(remote)
        await api.createSession(id, flags.new, ad.name, proj?.cfg.shareKey)
        console.log(`new shared session "${flags.new}" ${id}`)
      } else {
        if (!args[0]) throw new Error("usage: mc open <name|id|url> | mc open --new <name>")
        const ref = parseSessionRef(args[0])
        id = await resolveLocal(cwd, ref.id, agentName, { url: pRemote, shareKey: pKey })
        const r = await pull({ id, cwd, remote: ref.remote ?? remote, shareKey: ref.key ?? flags.key ?? proj?.cfg.shareKey, link: true, adapter: flags.agent })
        ad = getAdapter(r.adapter)
        console.log(`pulled ${r.added} new entries [${ad.name}]`)
      }
      const mode = flags.mode ?? proj?.cfg.mode ?? "turn"
      if (mode === "live") console.log(`live daemon pid ${await startLiveDaemon(id, cwd, remote)}`)
      const proc = Bun.spawn(ad.launch(id, !!flags.new), { cwd, stdio: ["inherit", "inherit", "inherit"] })
      await proc.exited
      await stopLiveDaemon(id)
      const r = await push({ id, transcriptPath: await ad.sessionPath(cwd, id), remote, cwd, shareKey: proj?.cfg.shareKey, adapter: ad.name })
      console.log(`pushed ${r.added} new entries on exit`)
      return
    }

    case "daemon": {
      const id = await resolveLocal(cwd, args[1], agentName, { url: pRemote, shareKey: pKey })
      if (args[0] === "stop") return console.log((await stopLiveDaemon(id)) ? `stopped live daemon for ${id}` : "no daemon running")
      const pid = await liveDaemonPid(id)
      return console.log(pid ? `live daemon running (pid ${pid})` : "no daemon running")
    }

    case "setup": {
      const which = args[0]
      if (!which) throw new Error("usage: mc setup claude|codex")
      const mcPath = Bun.which("mc") ?? new URL("../../bin/mc", import.meta.url).pathname
      const { file, added } = await setupHooks(which, mcPath)
      console.log(added.length ? `added ${added.join(", ")} hooks → ${file}` : `hooks already present in ${file}`)
      if (which === "codex") console.log("codex will ask you to trust the new hooks once on next start (or pass --dangerously-bypass-hook-trust in automation)")
      if (which === "claude") console.log("(alternative: load the plugin with `claude --plugin-dir ~/multiclaude/plugin`)")
      return
    }

    case "hook":
      return hook()

    default:
      console.error(`unknown command: ${cmd}\n`)
      console.log(HELP)
      process.exit(1)
  }
}

/**
 * Claude Code hook entrypoint — everything here is deterministic, no model turns.
 * stdin: {session_id, transcript_path, cwd, hook_event_name, source?}
 *   SessionStart     → pull; start live daemon in live mode; optionally inject "N new turns"
 *   UserPromptSubmit → pull (turn mode) so the file is current before Claude answers
 *   Stop             → push
 *   SessionEnd       → push, stop live daemon
 * A session is synced when it is `mc link`ed, or when the cwd has a .multiclaude.json (shareAll).
 */
async function hook() {
  const input = JSON.parse((await Bun.stdin.text()) || "{}")
  const id: string | undefined = input.session_id
  const path: string | undefined = input.transcript_path
  const hcwd: string = input.cwd ?? cwd
  const event: string = input.hook_event_name ?? args[0] ?? ""
  if (!id || !path) return
  const t = await tracked(id)
  const cfg = await loadConfig()
  const proj = await findProjectConfig(hcwd)
  const projOn = proj && proj.cfg.mode !== "off" && proj.cfg.shareAll
  if (!(t?.linked || projOn || cfg.autoPushAll)) return
  const remote = t?.remote ?? proj?.cfg.remote
  const mode = proj?.cfg.mode ?? "turn"
  const inject = proj?.cfg.inject ?? true
  const hasFile = await Bun.file(path).exists()
  const agent = detectAdapter(path).name

  const doPull = async () => {
    // Nothing to pull for a brand-new local session the remote has never seen.
    if (!t && !hasFile) return null
    return pull({ id, cwd: hcwd, remote, shareKey: t?.shareKey ?? proj?.cfg.shareKey, link: true, adapter: agent }).catch((e) => {
      if (!String(e).includes("404")) throw e
      return null
    })
  }
  const doPush = () =>
    hasFile ? push({ id, transcriptPath: path, remote, cwd: hcwd, link: true, quiet: true, shareKey: proj?.cfg.shareKey, adapter: agent }) : null
  const note = (r: Awaited<ReturnType<typeof pull>> | null, eventName: string) => {
    if (!r?.added || !inject) return
    const lines = r.newEntries
      .map((e) => summarize(e.raw, 240))
      .filter(Boolean)
      .map((s) => `${s!.role === "user" ? "teammate" : "claude"}: ${s!.text}`)
    if (!lines.length) return
    const ctx = `[multiclaude] ${lines.length} new turn(s) from teammates landed in this session:\n${lines.slice(-8).join("\n")}`
    console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: eventName, additionalContext: ctx } }))
  }

  try {
    switch (event) {
      case "SessionStart": {
        await doPush() // lines written after the last Stop (e.g. summaries) go out first
        note(await doPull(), "SessionStart")
        if (mode === "live") await startLiveDaemon(id, hcwd, remote)
        break
      }
      case "UserPromptSubmit": {
        if (mode === "live") break // daemon already keeps the file current
        await doPush()
        note(await doPull(), "UserPromptSubmit")
        break
      }
      case "Stop":
        await doPush()
        break
      case "SessionEnd":
        await doPush()
        await stopLiveDaemon(id)
        break
    }
  } catch (e) {
    console.error(`mc hook (${event}): ${(e as Error).message}`)
  }
}

main().catch((e) => {
  console.error(`mc: ${e.message ?? e}`)
  process.exit(1)
})
