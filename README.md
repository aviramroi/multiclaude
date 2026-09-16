# multiclaude

git-style **push / pull** and **live multiplayer** for **Claude Code** and **Codex** sessions — across accounts and machines.

```
you                              server (Bun + SQLite + WS)              teammate
~/.claude/projects/…/<id>.jsonl ──mc push──▶  entries(session,id,parent,raw)  ◀──mc clone/pull── ~/.claude/projects/…/<id>.jsonl
                                ◀──mc pull──  dedupe by uuid, seq cursor     ──mc push──▶
      mc live  ◀════════════════ websocket room per session ════════════════▶  mc live / mc watch
```

## Install (no git, no runtimes)

**Let your agent do it.** Paste into Claude Code or Codex:

> Set up multiclaude on this machine: run `curl -fsSL https://multiclaude-rouge.vercel.app/install.sh | bash` and then `mc login https://multiclaude-rouge.vercel.app`. Send me the approval link it prints and stop.

The script drops one static `mc` binary into `~/.multiclaude/bin` and wires the Claude Code / Codex hooks. The agent gets a working token immediately; you open the link, enter your email + a 6-digit code, and the machine is approved (Neon-style claimable signup). Nothing else is created without you.

## Share a project — zero tokens, hooks do everything
```sh
cd ~/proj && mc init                # prints an invite link  https://multiclaude-rouge.vercel.app/j/<key>
claude                              # every session in this folder now syncs: push on Stop, pull on start/prompt
```
Teammate (any account, any machine) pastes the invite link to their agent — or:
```sh
cd ~/proj && mc join https://multiclaude-rouge.vercel.app/j/<key>   # pulls + creates YOUR branch of the latest session
# → type /resume in Claude Code (opened here) and pick it. Or in a terminal: mc open <name>
mc ls                               # everyone's sessions and branches
mc branch <name>                    # branch another shared session
```
**Branches, not shared files.** Joining gives you your own copy of the session (new id, full history, `forked_from` set) — like `git branch`. Both of you keep working; each side's turns sync to its own branch, so nothing ever diverges or gets clobbered. The original owner pulls your branch (`mc pull --all`) and resumes it to see where you took it.
Hooks: `SessionStart`/`UserPromptSubmit` → pull, `Stop`/`SessionEnd` → push, live mode (`mc init --mode live`) → background `mc live` daemon.
Claude never spends a turn on sync; it only sees a compact `[multiclaude] N new turn(s)` note when teammates added something (disable with `mc init --no-inject`).
From inside Claude, `! mc invite` / `! mc status` run without a model turn.

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
