---
description: Push this Claude session to the shared multiclaude remote (git-style)
allowed-tools: Bash(mc:*)
argument-hint: "[--name <name>] [--link]"
---
Run `mc push $ARGUMENTS` for the current session (`mc` picks the latest session in this cwd).
Report the share command it prints so the user can hand it to a teammate.
If it says the session diverged, tell the user which side will win on resume (the latest leaf).
