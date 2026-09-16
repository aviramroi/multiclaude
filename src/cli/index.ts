#!/usr/bin/env bun
import { parseArgs } from "node:util"
import { basename } from "node:path"
import { getAdapter } from "../core/adapters"
import { loadConfig, saveConfig, loadState, saveState } from "../core/config"
import { Client } from "../core/client"
import { leaves, readTranscript, summarize } from "../core/transcript"
import { client, pull, push, resolveLocal, tracked, track } from "./sync"
import { live, printEntry } from "./live"

const HELP = `mc — multiclaude: git-style sync + live multiplayer for Claude Code sessions

  mc login [url] [--token T] [--name N]   set remote (default http://localhost:4747), register/auth
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

  refs: full id, unique prefix, name given at push, or "latest"
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
    help: { type: "boolean", short: "h" },
  },
})

const [cmd, ...args] = positionals
const cwd = flags.cwd ?? process.cwd()
const adapter = getAdapter("claude")

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
      console.log(`token: ${cfg.token}  (reuse with: mc login ${cfg.remote} --token …)`)
      return
    }

    case "push": {
      const id = await resolveLocal(cwd, args[0])
      const path = adapter.sessionPath(cwd, id)
      const r = await push({ id, transcriptPath: path, name: flags.name, remote: flags.remote, cwd, link: flags.link })
      const t = await tracked(id)
      console.log(`pushed ${r.added} new / ${r.total} entries → ${t?.remote}/sessions/${id} (head ${r.head})`)
      if (r.diverged) console.log("⚠ session has diverged branches; the latest leaf wins on resume")
      if (t?.shareKey) console.log(`share: mc clone ${t.remote}/sessions/${id}?key=${t.shareKey}`)
      return
    }

    case "pull": {
      if (!args[0]) throw new Error("usage: mc pull <session>")
      const ref = parseSessionRef(args[0])
      const id = await resolveLocal(cwd, ref.id)
      const r = await pull({ id, cwd, remote: ref.remote ?? flags.remote, shareKey: ref.key ?? flags.key, link: flags.link })
      console.log(`pulled ${r.added} new entries → ${r.path} (head ${r.head})`)
      if (r.diverged) console.log("⚠ diverged branches present")
      console.log(`resume: ${adapter.resumeCommand(id)}`)
      return
    }

    case "clone": {
      if (!args[0]) throw new Error("usage: mc clone <url|id> [--key K]")
      const ref = parseSessionRef(args[0])
      const r = await pull({ id: ref.id, cwd, remote: ref.remote ?? flags.remote, shareKey: ref.key ?? flags.key, link: flags.link ?? true })
      console.log(`cloned ${r.added} entries → ${r.path}`)
      console.log(`\n  ${adapter.resumeCommand(ref.id)}\n`)
      return
    }

    case "share": {
      const id = await resolveLocal(cwd, args[0])
      let t = await tracked(id)
      if (!t?.shareKey) {
        const { api } = await client(flags.remote)
        const s = await api.getSession(id)
        t = await track(id, { shareKey: s.share_key, remote: api.base })
      }
      console.log(`mc clone ${t.remote}/sessions/${id}?key=${t.shareKey}`)
      return
    }

    case "link":
    case "unlink": {
      const id = await resolveLocal(cwd, args[0])
      await track(id, { linked: cmd === "link", cwd })
      console.log(`${cmd}ed ${id}${cmd === "link" ? " — hooks will auto push on Stop / pull on SessionStart" : ""}`)
      return
    }

    case "live": {
      const id = await resolveLocal(cwd, args[0])
      const path = adapter.sessionPath(cwd, id)
      const t = await tracked(id)
      if (!t) {
        // first time: make sure the remote has it
        if (await Bun.file(path).exists()) await push({ id, transcriptPath: path, remote: flags.remote, cwd })
        else await pull({ id, cwd, remote: flags.remote, shareKey: flags.key })
      }
      await live({ id, path, cwd, remote: flags.remote })
      return
    }

    case "watch": {
      if (!args[0]) throw new Error("usage: mc watch <session>")
      const ref = parseSessionRef(args[0])
      const { api } = await client(ref.remote ?? flags.remote)
      if (ref.key ?? flags.key) await api.join(ref.id, (ref.key ?? flags.key)!)
      const { entries } = await api.pullEntries(ref.id, 0)
      for (const e of entries) printEntry(e)
      await track(ref.id, { cursor: Math.max(0, ...entries.map((e) => e.seq ?? 0)), remote: api.base })
      await live({ id: ref.id, path: "", cwd, readonly: true, remote: api.base })
      return
    }

    case "log": {
      const id = await resolveLocal(cwd, args[0])
      const entries = await readTranscript(adapter.sessionPath(cwd, id))
      for (const e of entries) {
        const s = summarize(e.raw, 400)
        if (s) console.log(`${s.role === "user" ? "you   ▸" : "claude▸"} ${s.text}`)
      }
      return
    }

    case "status": {
      const id = await resolveLocal(cwd, args[0])
      const path = adapter.sessionPath(cwd, id)
      const entries = await readTranscript(path)
      const t = await tracked(id)
      const lv = leaves(entries)
      console.log(`session  ${id}${t?.name ? ` (${t.name})` : ""}`)
      console.log(`local    ${entries.length} entries, ${lv.length} leaf${lv.length === 1 ? "" : " ⚠ diverged"}  ${path}`)
      if (!t) return console.log("remote   not tracked (run: mc push)")
      const { api } = await client(t.remote)
      const s = await api.getSession(id, t.shareKey)
      const { missing } = await api.have(id, entries.map((e) => e.id))
      console.log(`remote   ${s.entries} entries, head ${s.head}, cursor ${t.cursor}  ${t.remote}`)
      console.log(`         ahead ${missing.length} (unpushed)  behind ${Math.max(0, s.head - t.cursor)} (unpulled, approx)`)
      console.log(`linked   ${t.linked ? "yes (auto sync via hooks)" : "no"}`)
      return
    }

    case "ls": {
      if (flags.local) {
        const state = await loadState()
        for (const s of await adapter.listSessions(cwd)) {
          const t = state.sessions[s.id]
          console.log(`${s.id}  ${new Date(s.mtime).toISOString().slice(0, 16)}  ${t ? (t.linked ? "linked" : "tracked") : ""} ${t?.name ?? ""}`)
        }
        return
      }
      const { api } = await client(flags.remote)
      const list = await api.listSessions()
      if (flags.json) return console.log(JSON.stringify(list, null, 2))
      for (const s of list) console.log(`${s.id}  ${String(s.entries).padStart(5)} entries  ${s.updated_at}  ${s.name ?? ""}`)
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
 * Claude Code hook entrypoint. stdin: {session_id, transcript_path, cwd, hook_event_name, source?}
 * SessionStart → pull linked session, surface new remote turns as context.
 * Stop         → push linked session (or every session with autoPushAll).
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
  try {
    if (event === "SessionStart" && t?.linked) {
      const r = await pull({ id, cwd: hcwd, remote: t.remote })
      if (r.added) {
        const lines = r.newEntries.map((e) => summarize(e.raw, 300)).filter(Boolean).map((s) => `${s!.role}: ${s!.text}`)
        const ctx = `multiclaude pulled ${r.added} new entries from teammates into this session. Newest turns:\n${lines.slice(-12).join("\n")}`
        console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: ctx } }))
      }
    } else if (event === "Stop" && (t?.linked || cfg.autoPushAll)) {
      await push({ id, transcriptPath: path, remote: t?.remote, cwd: hcwd, quiet: true })
    }
  } catch (e) {
    console.error(`mc hook (${event}): ${(e as Error).message}`)
  }
}

main().catch((e) => {
  console.error(`mc: ${e.message ?? e}`)
  process.exit(1)
})
