# multiclaude

git-style **push / pull** and **live multiplayer** for **Claude Code** and **Codex** sessions — across accounts and machines.

```
you                              server (Bun + SQLite + WS)              teammate
~/.claude/projects/…/<id>.jsonl ──mc push──▶  entries(session,id,parent,raw)  ◀──mc clone/pull── ~/.claude/projects/…/<id>.jsonl
                                ◀──mc pull──  dedupe by uuid, seq cursor     ──mc push──▶
      mc live  ◀════════════════ websocket room per session ════════════════▶  mc live / mc watch
```

## Install

**Let your agent do it.** Paste into Claude Code or Codex:

> Install multiclaude on this machine and connect it: run `curl -fsSL https://<your-server>/install.sh | bash`, then `mc login https://<your-server>`. Send me the approval link it prints and stop.

The agent gets a working token immediately; you open the link, enter your email + a 6-digit code, and the machine is approved (Neon-style claimable signup). Nothing else is created without you.

**By hand:**
```sh
git clone https://github.com/aviramroi/multiclaude ~/multiclaude && cd ~/multiclaude && bun install
ln -s ~/multiclaude/bin/mc ~/.local/bin/mc          # or: bun run build && cp dist/mc ~/.local/bin
bun run server                                       # self-host, :4747 (PORT, MULTICLAUDE_DB, PUBLIC_URL, RESEND_API_KEY)
mc login http://localhost:4747                       # prints the approval link
mc setup claude && mc setup codex                    # hooks; or: claude --plugin-dir ~/multiclaude/plugin
```
The server also serves the landing page (`/`), `install.sh`, the claim flow (`/claim/<code>`) and a minimal account page (`/account`). Without `RESEND_API_KEY` the email code is printed to the server log.

## Zero-token workflow (hooks do everything)
```sh
cd ~/proj && mc init                # or: mc init --mode live   → writes .multiclaude.json, commit it
claude                              # every session here is now shared: push on Stop, pull on start/prompt
# teammate (any account, after git pull):
mc ls                               # see the project's sessions
mc open <name|id>                   # pull → claude --resume → push on exit (live daemon in live mode)
```
Hooks: `SessionStart`/`UserPromptSubmit` → pull, `Stop`/`SessionEnd` → push, live mode → background `mc live` daemon.
Claude never spends a turn on sync; it only sees a compact `[multiclaude] N new turn(s)` note when teammates added something (disable with `mc init --no-inject`).
From inside Claude, `! mc share` / `! mc status` run without a model turn.

## Turn-based (manual, like git)
```sh
mc push --name auth-refactor --link      # from the project dir; prints a share link
# teammate, any account:
mc clone "http://host:4747/sessions/<id>?key=…"
claude --resume <id>                     # continue the exact conversation
mc push                                  # when done
# you:
mc pull auth-refactor && claude --resume <id>
```
`--link` (or `mc link <id>`) turns on hooks: **Stop → push**, **SessionStart → pull** (+ injects the new remote turns as context).

## Live (multiplayer)
```sh
mc live auth-refactor       # on both machines; two-way streaming of every transcript line
mc watch <id>               # read-only live view, no local file
```

## Codex
```sh
mc setup codex                         # merges SessionStart/UserPromptSubmit/Stop/SessionEnd → `mc hook` into ~/.codex/hooks.json
cd ~/proj && mc init --agent codex     # (or add "agent": "codex" to .multiclaude.json)
codex                                  # sessions in this dir are now shared, same as Claude
mc open codex-demo                     # teammate: pull → `codex resume <id>` → push on exit
```
Codex rollouts (`~/.codex/sessions/YYYY/MM/DD/rollout-*-<id>.jsonl`) are linear logs without uuids, so lines are identified by content hash; `session_meta.cwd` is rewritten on pull. Codex hooks use the same schema and payload as Claude Code's, so `mc hook` serves both. A session stays in its harness: Claude sessions are shared between Claude users, Codex between Codex users (no cross-harness translation).

## Design
- A transcript is an append-only JSONL **DAG** (`uuid` → `parentUuid`). Sync = set union of lines; the server dedupes by id, so every operation is idempotent and safe to repeat.
- Lines without a uuid (queue-ops, prompts) get a content hash id.
- Server: `/auth/register`, `/sessions`, `/sessions/:id/{have,entries,join,ws}`. Access = owner, member, or `x-share-key`.
- Pull rewrites `cwd` and `sessionId` so `claude --resume` works from any project path.
- Adapters (`src/core/adapters.ts`) isolate harness specifics: session paths, launch/resume argv, hooks file. Hooks auto-detect the harness from `transcript_path`.

## Known limits
- Claude Code loads the transcript once; teammates' lines appear after `claude --resume`. Live mode keeps files in sync in real time, not the in-memory conversation.
- Both sides talking at once ⇒ diverged branches; newest leaf wins on resume, nothing is lost.
- Hosted option: deploy `src/server` anywhere Bun runs (`Dockerfile` included); `mc login https://…` points clients at it.

## Dev
`bun test` · `./test/e2e.sh` (two fake accounts, push/clone/pull/hooks/live)
