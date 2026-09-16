---
name: multiclaude
description: Share, hand off, or co-drive a Claude Code session across accounts/machines. Use when the user mentions sharing a session, multiplayer, handing off to a teammate, or continuing someone else's session.
---
# multiclaude — hook-driven session sync

Sync is done by **hooks calling `mc hook`**, not by you. Do not run `mc push`/`mc pull` yourself
unless the user explicitly asks; hooks already push on Stop/SessionEnd and pull on SessionStart/UserPromptSubmit.

When a `[multiclaude] N new turn(s) from teammates…` block appears in your context, treat those
turns as part of this conversation (they are in the transcript file; they are simply newer than
what you loaded).

## What to tell the user
- Enable per project: `mc init` (turn-based) or `mc init --mode live` → commit `.multiclaude.json`.
- Zero-token control from the prompt line: `! mc share`, `! mc status`, `! mc ls`.
- Open a shared session with everything wired: `mc open <name>` (or `mc open --new <name>`).
- Teammate: `git pull` (gets `.multiclaude.json`) → `mc ls` → `mc open <name>`.
- A running session doesn't reload the transcript; hooks inject a compact summary of new turns instead.
- Simultaneous turns ⇒ diverged branches (`mc status` warns); newest leaf wins, nothing is lost.
