/** install.sh, served at /install.sh. Downloads one static `mc` binary from GitHub Releases — no git, bun or node needed. */
export const installScript = (host: string) => `#!/usr/bin/env bash
# multiclaude installer — ${host}/install.sh
set -euo pipefail
REPO="\${MULTICLAUDE_REPO:-aviramroi/multiclaude}"
DIR="\${MULTICLAUDE_BIN:-$HOME/.multiclaude/bin}"
case "$(uname -s)-$(uname -m)" in
  Darwin-arm64) T=darwin-arm64;; Darwin-x86_64) T=darwin-x64;;
  Linux-x86_64) T=linux-x64;; Linux-aarch64|Linux-arm64) T=linux-arm64;;
  *) echo "unsupported platform: $(uname -s)-$(uname -m)"; exit 1;;
esac
URL="https://github.com/$REPO/releases/latest/download/mc-$T"
mkdir -p "$DIR"
echo "→ downloading mc ($T)"
curl -fsSL "$URL" -o "$DIR/mc.tmp" && chmod +x "$DIR/mc.tmp" && mv "$DIR/mc.tmp" "$DIR/mc"
# make \`mc\` available in new shells
for rc in "$HOME/.zshrc" "$HOME/.bashrc" "$HOME/.profile"; do
  [ -f "$rc" ] || continue
  grep -q '.multiclaude/bin' "$rc" 2>/dev/null || printf '\\n# multiclaude\\nexport PATH="$HOME/.multiclaude/bin:$PATH"\\n' >> "$rc"
done
export PATH="$DIR:$PATH"
command -v claude >/dev/null 2>&1 && "$DIR/mc" setup claude || true
command -v codex  >/dev/null 2>&1 && "$DIR/mc" setup codex  || true
echo
echo "✓ mc installed to $DIR/mc"
echo "  next:  mc login ${host}"
`
