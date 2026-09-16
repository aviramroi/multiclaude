#!/usr/bin/env bash
# Forward the hook payload (stdin JSON) to `mc hook`. Silent no-op when mc is missing.
MC=$(command -v mc || ls "$HOME/.multiclaude/bin/mc" "${CLAUDE_PLUGIN_ROOT}/../bin/mc" 2>/dev/null | head -1)
[ -x "$MC" ] || exit 0
exec "$MC" hook
