---
description: Pull teammates' changes for a shared session into this project
allowed-tools: Bash(mc:*)
argument-hint: "<session|name|url>"
---
Run `mc pull $ARGUMENTS`. Then run `mc log $ARGUMENTS` and summarize, in bullets, what the
teammate did since the last sync. Remind the user the running session only reloads the
transcript on `claude --resume <id>`; offer to summarize the new turns instead.
