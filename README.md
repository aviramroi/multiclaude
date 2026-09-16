# multiclaude

git-style **push / pull** and **live multiplayer** for Claude Code sessions — across accounts and machines. Codex adapter next.

```
you                              server (Bun + SQLite + WS)              teammate
~/.claude/projects/…/<id>.jsonl ──mc push──▶  entries(session,id,parent,raw)  ◀──mc clone/pull── ~/.claude/projects/…/<id>.jsonl
                                ◀──mc pull──  dedupe by uuid, seq cursor     ──mc push──▶
      mc live  ◀════════════════ websocket room per session ════════════════▶  mc live / mc watch
```

## Install
```sh
git clone … ~/multiclaude && cd ~/multiclaude && bun install
ln -s ~/multiclaude/bin/mc /usr/local/bin/mc        # or: bun run build && cp dist/mc /usr/local/bin
bun run server                                       # self-host, :4747 (PORT, MULTICLAUDE_DB)
mc login http://localhost:4747                       # registers a token for this machine/account
claude plugin add ~/multiclaude/plugin               # /multiclaude:push, :pull, :clone, :share, :live, :status + hooks
```

## Turn-based (like git)
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

## Design
- A transcript is an append-only JSONL **DAG** (`uuid` → `parentUuid`). Sync = set union of lines; the server dedupes by id, so every operation is idempotent and safe to repeat.
- Lines without a uuid (queue-ops, prompts) get a content hash id.
- Server: `/auth/register`, `/sessions`, `/sessions/:id/{have,entries,join,ws}`. Access = owner, member, or `x-share-key`.
- Pull rewrites `cwd` and `sessionId` so `claude --resume` works from any project path.
- Adapters (`src/core/adapters.ts`) isolate harness specifics; `codex` is stubbed for `~/.codex/sessions`.

## Known limits
- Claude Code loads the transcript once; teammates' lines appear after `claude --resume`. Live mode keeps files in sync in real time, not the in-memory conversation.
- Both sides talking at once ⇒ diverged branches; newest leaf wins on resume, nothing is lost.
- Hosted option: deploy `src/server` anywhere Bun runs (`Dockerfile` included); `mc login https://…` points clients at it.

## Dev
`bun test` · `./test/e2e.sh` (two fake accounts, push/clone/pull/hooks/live)
