#!/usr/bin/env bash
# multiclaude installer — served at __HOST__/install.sh
# Installs bun if missing, clones the repo to ~/.multiclaude/src, links `mc`, wires hooks for Claude Code / Codex.
set -euo pipefail
REPO="${MULTICLAUDE_REPO:-https://github.com/aviramroi/multiclaude}"
DEST="${MULTICLAUDE_SRC:-$HOME/.multiclaude/src}"
BIN_DIR="${MULTICLAUDE_BIN:-$HOME/.local/bin}"

if ! command -v bun >/dev/null 2>&1; then
  echo "→ installing bun"
  curl -fsSL https://bun.sh/install | bash >/dev/null
  export PATH="$HOME/.bun/bin:$PATH"
fi
if [ -d "$DEST/.git" ]; then
  echo "→ updating $DEST"; git -C "$DEST" pull -q --ff-only
else
  echo "→ cloning $REPO"; mkdir -p "$(dirname "$DEST")"; git clone -q "$REPO" "$DEST"
fi
(cd "$DEST" && bun install --silent)
mkdir -p "$BIN_DIR" && ln -sf "$DEST/bin/mc" "$BIN_DIR/mc"
case ":$PATH:" in *":$BIN_DIR:"*) ;; *) echo "→ add to PATH: export PATH=\"$BIN_DIR:\$PATH\"";; esac
export PATH="$BIN_DIR:$PATH"

command -v claude >/dev/null 2>&1 && mc setup claude || true
command -v codex  >/dev/null 2>&1 && mc setup codex  || true
echo
echo "✓ mc installed. Next:  mc login __HOST__"
