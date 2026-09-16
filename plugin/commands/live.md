---
description: Start live multiplayer sync for this session (two-way, real-time)
allowed-tools: Bash(mc:*)
---
Start `mc live $ARGUMENTS` in the background with the Bash tool (run_in_background) and tell the user:
- their turns now stream to every teammate running `mc live` or `mc watch` on this session
- teammates' turns land in the transcript file; run `claude --resume <id>` to load them
Print the share link with `mc share`.
