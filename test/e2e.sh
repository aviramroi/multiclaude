#!/usr/bin/env bash
# Two accounts (A, B) with separate HOME dirs share one session through a local server.
set -eo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
T=$(cd "$(mktemp -d)" && pwd -P); trap '[ -n "${SRV:-}" ] && kill $SRV 2>/dev/null; pkill -f "cli/index.ts live demo" 2>/dev/null; rm -rf "$T"' EXIT
export PORT=47470; export MULTICLAUDE_DB="$T/server.db" MULTICLAUDE_REMOTE="http://localhost:$PORT"
bun run "$ROOT/src/server/index.ts" >"$T/server.log" 2>&1 & SRV=$!
for i in $(seq 1 100); do curl -sf "$MULTICLAUDE_REMOTE/health" >/dev/null && break; sleep 0.1; done; curl -sf "$MULTICLAUDE_REMOTE/health" >/dev/null || { echo "server failed:"; cat "$T/server.log"; exit 1; }

mc() { local who=$1; shift; HOME="$T/$who" MULTICLAUDE_HOME="$T/$who/.multiclaude" MULTICLAUDE_USER="$who" bun run "$ROOT/src/cli/index.ts" "$@"; }
mkdir -p "$T/A/proj" "$T/B/proj"
SID=11111111-2222-4333-8444-555555555555
PA="$T/A/.claude/projects/$(echo "$T/A/proj" | sed 's/[^a-zA-Z0-9]/-/g')"; mkdir -p "$PA"
line() { printf '{"parentUuid":%s,"isSidechain":false,"type":"%s","message":{"role":"%s","content":"%s"},"uuid":"%s","timestamp":"2026-09-16T10:00:0%sZ","cwd":"%s","sessionId":"%s","version":"2.1.273"}\n' "$1" "$2" "$2" "$3" "$4" "$5" "$6" "$SID"; }
{ line null user "hello from A" u1 0 "$T/A/proj"; line '"u1"' assistant "hi A" a1 1 "$T/A/proj"; } > "$PA/$SID.jsonl"

echo "== A push"; (cd "$T/A/proj" && mc A push --name demo --link)
SHARE=$(cd "$T/A/proj" && mc A share demo | awk '{print $3}')
echo "== B clone $SHARE"; (cd "$T/B/proj" && mc B clone "$SHARE")
PB="$T/B/.claude/projects/$(echo "$T/B/proj" | sed 's/[^a-zA-Z0-9]/-/g')/$SID.jsonl"
test "$(wc -l <"$PB")" -eq 2 || { echo "FAIL: B expected 2 lines"; cat "$PB"; exit 1; }
grep -q "\"cwd\":\"$T/B/proj\"" "$PB" || { echo "FAIL: cwd not localized"; exit 1; }

echo "== B continues the conversation"; { line '"a1"' user "B here, continuing" u2 2 "$T/B/proj"; line '"u2"' assistant "welcome B" a2 3 "$T/B/proj"; } >> "$PB"
(cd "$T/B/proj" && mc B push)
echo "== A pull"; (cd "$T/A/proj" && mc A pull demo)
test "$(wc -l <"$PA/$SID.jsonl")" -eq 4 || { echo "FAIL: A expected 4 lines"; exit 1; }
grep -q '"cwd":"'"$T/A/proj"'"' "$PA/$SID.jsonl" && ! grep -q "$T/B/proj" "$PA/$SID.jsonl" || { echo "FAIL: A cwd rewrite"; exit 1; }

echo "== idempotent re-push / re-pull"; (cd "$T/A/proj" && mc A push | grep -q "pushed 0 new") && (cd "$T/B/proj" && mc B pull demo | grep -q "pulled 0 new")
echo "== status"; (cd "$T/A/proj" && mc A status demo)
echo "== hook: Stop pushes, SessionStart pulls with context"
{ line '"a2"' user "from A via hook" u3 4 "$T/A/proj"; } >> "$PA/$SID.jsonl"
printf '{"session_id":"%s","transcript_path":"%s","cwd":"%s","hook_event_name":"Stop"}' "$SID" "$PA/$SID.jsonl" "$T/A/proj" | (cd "$T/A/proj" && mc A hook)
OUT=$(printf '{"session_id":"%s","transcript_path":"%s","cwd":"%s","hook_event_name":"SessionStart"}' "$SID" "$PB" "$T/B/proj" | (cd "$T/B/proj" && mc B hook))
echo "$OUT" | grep -q "from A via hook" || { echo "FAIL: SessionStart context missing: $OUT"; exit 1; }
test "$(wc -l <"$PB")" -eq 5 || { echo "FAIL: B expected 5 lines"; exit 1; }

echo "== live: B watches, A appends, B's file receives it"
(cd "$T/B/proj" && mc B live demo >"$T/live-B.log" 2>&1 &) ; sleep 1.2
(cd "$T/A/proj" && mc A live demo >"$T/live-A.log" 2>&1 &) ; sleep 1.2
{ line '"u3"' assistant "live reply from A" a3 5 "$T/A/proj"; } >> "$PA/$SID.jsonl"
for i in $(seq 1 30); do grep -q "live reply from A" "$PB" && break; sleep 0.2; done
grep -q "live reply from A" "$PB" || { echo "FAIL: live sync"; cat "$T/live-A.log" "$T/live-B.log"; exit 1; }
grep -q "live reply from A" "$T/live-B.log" && echo "B saw A's live entry"
pkill -f "cli/index.ts live demo" || true
echo "== project mode: .multiclaude.json + hooks only, no link, no manual push"
mkdir -p "$T/A/proj2" "$T/B/proj2"
(cd "$T/A/proj2" && mc A init >/dev/null) && cp "$T/A/proj2/.multiclaude.json" "$T/B/proj2/"   # "git pull" the config
SID2=22222222-2222-4333-8444-555555555555
PA2="$T/A/.claude/projects/$(echo "$T/A/proj2" | sed 's/[^a-zA-Z0-9]/-/g')"; mkdir -p "$PA2"
SIDSAVE=$SID; SID=$SID2
{ line null user "proj2 from A" p1 0 "$T/A/proj2"; line '"p1"' assistant "ok A" p2 1 "$T/A/proj2"; } > "$PA2/$SID2.jsonl"
printf '{"session_id":"%s","transcript_path":"%s","cwd":"%s","hook_event_name":"Stop"}' "$SID2" "$PA2/$SID2.jsonl" "$T/A/proj2" | (cd "$T/A/proj2" && mc A hook)
(cd "$T/B/proj2" && mc B ls | grep -q "$SID2") || { echo "FAIL: B cannot list project session"; exit 1; }
PB2="$T/B/.claude/projects/$(echo "$T/B/proj2" | sed 's/[^a-zA-Z0-9]/-/g')/$SID2.jsonl"
(cd "$T/B/proj2" && mc B pull "$SID2" >/dev/null) && test "$(wc -l <"$PB2")" -eq 2 || { echo "FAIL: B pull via project share key"; exit 1; }
{ line '"p2"' user "B on proj2" p3 2 "$T/B/proj2"; } >> "$PB2"
printf '{"session_id":"%s","transcript_path":"%s","cwd":"%s","hook_event_name":"SessionEnd"}' "$SID2" "$PB2" "$T/B/proj2" | (cd "$T/B/proj2" && mc B hook)
OUT=$(printf '{"session_id":"%s","transcript_path":"%s","cwd":"%s","hook_event_name":"UserPromptSubmit"}' "$SID2" "$PA2/$SID2.jsonl" "$T/A/proj2" | (cd "$T/A/proj2" && mc A hook))
echo "$OUT" | grep -q "B on proj2" || { echo "FAIL: UserPromptSubmit did not pull/inject: $OUT"; exit 1; }
test "$(wc -l <"$PA2/$SID2.jsonl")" -eq 3 || { echo "FAIL: A expected 3 lines in proj2"; exit 1; }
echo "== live mode via hooks: SessionStart spawns daemon, SessionEnd stops it"
(cd "$T/A/proj2" && mc A init --mode live >/dev/null)
printf '{"session_id":"%s","transcript_path":"%s","cwd":"%s","hook_event_name":"SessionStart"}' "$SID2" "$PA2/$SID2.jsonl" "$T/A/proj2" | (cd "$T/A/proj2" && mc A hook) >/dev/null
sleep 1; (cd "$T/A/proj2" && mc A daemon status "$SID2" | grep -q "running") || { echo "FAIL: daemon not started"; cat "$T/A/.multiclaude/live/"*.log; exit 1; }
printf '{"session_id":"%s","transcript_path":"%s","cwd":"%s","hook_event_name":"SessionEnd"}' "$SID2" "$PA2/$SID2.jsonl" "$T/A/proj2" | (cd "$T/A/proj2" && mc A hook)
sleep 0.5; (cd "$T/A/proj2" && mc A daemon status "$SID2" | grep -q "no daemon") || { echo "FAIL: daemon not stopped"; exit 1; }
SID=$SIDSAVE
echo; echo "ALL PASSED"
