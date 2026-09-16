#!/usr/bin/env bash
# Live mode over long polling (serverless-style host without WebSockets).
set -eo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
T=$(cd "$(mktemp -d)" && pwd -P); trap '[ -n "${SRV:-}" ] && kill $SRV 2>/dev/null; pkill -f "cli/index.ts live poll" 2>/dev/null; rm -rf "$T"' EXIT
export PORT=47480; export MULTICLAUDE_DB="$T/s.db" MULTICLAUDE_REMOTE="http://localhost:$PORT"
bun run "$ROOT/test/serve-nows.ts" >"$T/srv.log" 2>&1 & SRV=$!
for i in $(seq 1 100); do curl -sf "$MULTICLAUDE_REMOTE/health" >/dev/null && break; sleep 0.1; done
mc() { local who=$1; shift; HOME="$T/$who" MULTICLAUDE_HOME="$T/$who/.multiclaude" MULTICLAUDE_USER="$who" bun run "$ROOT/src/cli/index.ts" "$@"; }
mkdir -p "$T/A/proj" "$T/B/proj"
SID=33333333-2222-4333-8444-555555555555
PA="$T/A/.claude/projects/$(echo "$T/A/proj" | sed 's/[^a-zA-Z0-9]/-/g')"; mkdir -p "$PA"
line() { printf '{"parentUuid":%s,"type":"%s","message":{"role":"%s","content":"%s"},"uuid":"%s","timestamp":"2026-09-16T10:00:0%sZ","cwd":"%s","sessionId":"%s"}\n' "$1" "$2" "$2" "$3" "$4" "$5" "$6" "$SID"; }
line null user "hello" u1 0 "$T/A/proj" > "$PA/$SID.jsonl"
(cd "$T/A/proj" && mc A push --name poll >/dev/null)
KEY=$(cd "$T/A/proj" && mc A share poll | grep -o 'key=[a-z0-9]*' | head -1 | sed 's/key=//')
(cd "$T/B/proj" && mc B clone "$MULTICLAUDE_REMOTE/sessions/$SID?key=$KEY" >/dev/null)
PB="$T/B/.claude/projects/$(echo "$T/B/proj" | sed 's/[^a-zA-Z0-9]/-/g')/$SID.jsonl"
(cd "$T/B/proj" && mc B live poll >"$T/live-B.log" 2>&1 &); (cd "$T/A/proj" && mc A live poll >"$T/live-A.log" 2>&1 &); sleep 2
grep -q "long polling" "$T/live-A.log" || { echo "FAIL: did not fall back to polling"; cat "$T/live-A.log"; exit 1; }
line '"u1"' assistant "reply over poll" a1 1 "$T/A/proj" >> "$PA/$SID.jsonl"
for i in $(seq 1 40); do grep -q "reply over poll" "$PB" && break; sleep 0.25; done
grep -q "reply over poll" "$PB" || { echo "FAIL: poll live sync"; cat "$T/live-A.log" "$T/live-B.log"; exit 1; }
echo "ALL PASSED (long-poll live)"
