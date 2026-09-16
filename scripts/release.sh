#!/usr/bin/env bash
# Build static `mc` binaries for every platform and publish a GitHub release.
set -euo pipefail
V=${1:?usage: scripts-release.sh vX.Y.Z}
mkdir -p dist
for t in darwin-arm64 darwin-x64 linux-x64 linux-arm64; do
  echo "→ mc-$t"; bun build --compile --minify --target=bun-$t src/cli/index.ts --outfile dist/mc-$t
done
gh release create "$V" dist/mc-* --title "$V" --generate-notes
