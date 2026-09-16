---
name: multiclaude
description: Share, hand off, or co-drive a Claude Code session with another account or machine. Use when the user mentions sharing a session, multiplayer, handing off to a teammate, pushing/pulling a conversation, or continuing someone else's session.
---
# multiclaude — session sync

`mc` is a CLI (installed with the plugin) that treats a Claude Code transcript like a git repo.
Transcripts are append-only JSONL DAGs (`uuid`/`parentUuid`), so sync is a set-union of entries;
the server dedupes by id and every command is idempotent.

## Two modes
- **Turn-based (git-like):** `mc push` → share link → teammate `mc clone <link>` → `claude --resume <id>` → they work → `mc push` → you `mc pull`.
- **Live (multiplayer):** both sides run `mc live <id>`; every new line streams both ways. `mc watch <id>` is a read-only viewer.

## Commands
| goal | command |
|---|---|
| publish current session | `mc push --name <name> --link` |
| get share link | `mc share` |
| clone from link | `mc clone <url>` |
| pull teammate's turns | `mc pull <name|id>` |
| auto sync via hooks | `mc link <id>` (push on Stop, pull on SessionStart) |
| live co-driving | `mc live <id>` |
| inspect | `mc status`, `mc log`, `mc ls`, `mc ls --local` |
| point at a server | `mc login https://host [--token …]` |

## Constraints to tell the user
- A **running** Claude session does not reload its transcript. Pulled turns become visible after `claude --resume <id>`; the SessionStart hook also injects a summary of new remote turns as context.
- Concurrent turns on both sides create **diverged branches** (`mc status` warns). The newest leaf wins on resume; nothing is lost, the other branch stays in the file.
- Cross-account is fine: transcripts contain no credentials. `cwd`/`sessionId` are rewritten on pull; absolute paths inside tool calls are not.
