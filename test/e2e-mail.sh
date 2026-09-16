#!/usr/bin/env bash
# Admin configures SMTP from the CLI; approval then requires the emailed code.
set -e
ROOT=$(cd "$(dirname "$0")/.." && pwd)
T=$(cd "$(mktemp -d)" && pwd -P); trap '[ -n "${SRV:-}" ] && kill $SRV 2>/dev/null; [ -n "${SINK:-}" ] && kill $SINK 2>/dev/null; rm -rf "$T"' EXIT
export PORT=47490; export MULTICLAUDE_DB="$T/s.db" MULTICLAUDE_REMOTE="http://localhost:$PORT" SINK_FILE="$T/sink.txt" SINK_PORT=2526
bun run "$ROOT/test/smtp-sink.ts" >/dev/null 2>&1 & SINK=$!
bun run "$ROOT/src/server/index.ts" >"$T/srv.log" 2>&1 & SRV=$!
for i in $(seq 1 100); do curl -sf "$MULTICLAUDE_REMOTE/health" >/dev/null && break; sleep 0.1; done
mc() { local who=$1; shift; mkdir -p "$T/$who/w"; (cd "$T/$who/w" && HOME="$T/$who" MULTICLAUDE_HOME="$T/$who/.multiclaude" MULTICLAUDE_USER="$who" bun run "$ROOT/src/cli/index.ts" "$@"); }
B=$MULTICLAUDE_REMOTE
# first machine approves with no mail configured → becomes admin
CLAIM=$(mc admin whoami 2>&1 | grep -o "http[^ ]*claim/[a-z0-9]*" | head -1)
curl -s -c "$T/cj" -XPOST "$CLAIM/start" -d 'email=boss@example.com' | grep -q "You're all set" || { echo "FAIL: first approve"; exit 1; }
curl -s -b "$T/cj" "$B/admin" | grep -q "Email settings" || { echo "FAIL: admin page"; exit 1; }
# non-admin machine cannot configure
mc other whoami >/dev/null 2>&1 || true
(mc other admin mail --host 127.0.0.1 --port $SINK_PORT --user u --pass p --from x@example.com 2>&1 | grep -q "403") || { echo "FAIL: non-admin allowed"; exit 1; }
# admin configures SMTP via CLI (server sends a test mail through the sink)
mc admin admin mail --host 127.0.0.1 --port $SINK_PORT --user u --pass p --from codes@example.com | grep -q "email configured" || { echo "FAIL: admin mail"; cat "$T/srv.log"; exit 1; }
grep -q "TO boss@example.com" "$SINK_FILE" || { echo "FAIL: test mail not received"; cat "$SINK_FILE"; exit 1; }
mc admin admin status | grep -q "email on: smtp" || { echo "FAIL: status"; exit 1; }
# a new machine now needs the emailed code
CLAIM2=$(mc newbie whoami 2>&1 | grep -o "http[^ ]*claim/[a-z0-9]*" | head -1)
curl -s -XPOST "$CLAIM2/start" -d 'email=newbie@example.com' | grep -q "Check your email" || { echo "FAIL: otp step not required"; exit 1; }
CODE=$(grep -A30 "TO newbie@example.com" "$SINK_FILE" | grep -oE "approve it: [0-9]{6}" | head -1 | grep -oE "[0-9]{6}")
[ -n "$CODE" ] || { echo "FAIL: no code mailed"; cat "$SINK_FILE"; exit 1; }
curl -s -XPOST "$CLAIM2/verify" -d "email=newbie@example.com&otp=000000" | grep -q "Wrong or expired" || { echo "FAIL: bad code accepted"; exit 1; }
curl -s -XPOST "$CLAIM2/verify" -d "email=newbie@example.com&otp=$CODE" | grep -q "You're all set" || { echo "FAIL: good code rejected"; exit 1; }
mc newbie whoami | grep -q "approved by newbie@example.com" || { echo "FAIL: whoami"; exit 1; }
# turn off again
mc admin admin mail --off | grep -q "turned off"
echo "ALL PASSED (mail)"
