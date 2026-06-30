#!/usr/bin/env bash
# Phase 6: Cursor hook Tier 1 status integration.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK_DIR="${WORK_DIR:-$ROOT}"
WORK="node $WORK_DIR/dist/work.mjs"

SESSION_PREFIX="work-autotest-hooks"
SESSION="${SESSION_PREFIX}-$$"

TEST_ROOT="$(mktemp -d "/tmp/work-test-phase6-XXXXXX")"
export XDG_CONFIG_HOME="$TEST_ROOT/config"
export XDG_STATE_HOME="$TEST_ROOT/state"
export XDG_RUNTIME_DIR="$TEST_ROOT/runtime"
mkdir -p "$XDG_CONFIG_HOME" "$XDG_STATE_HOME" "$XDG_RUNTIME_DIR"
chmod 700 "$XDG_RUNTIME_DIR"

PASS=0
FAIL=0

pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }
assert_eq() {
  local desc="$1" expected="$2" actual="$3"
  if [[ "$actual" == "$expected" ]]; then pass "$desc"
  else fail "$desc (expected '$expected', got '$actual')"; fi
}
assert_contains() {
  local desc="$1" needle="$2" haystack="$3"
  if [[ "$haystack" == *"$needle"* ]]; then pass "$desc"
  else fail "$desc (missing '$needle')"; fi
}

section() { echo; echo "== $1 =="; }

cleanup() {
  tmux kill-session -t "$SESSION" 2>/dev/null || true
  rm -rf "$TEST_ROOT"
}
trap cleanup EXIT

section "1. Build & hook command smoke"
cd "$WORK_DIR"
npm run build >/dev/null

OUT=$($WORK agent hook-event --help 2>&1)
assert_contains "help lists hook-event" "hook-event" "$OUT"

OUT=$($WORK hooks install --help 2>&1)
assert_contains "help lists hooks install" "install" "$OUT"

section "2. Hook event applies explicit status"
tmux kill-session -t "$SESSION" 2>/dev/null || true
tmux new-session -d -s "$SESSION"
$WORK track "$SESSION" --quiet

AGENT_PANE=$(tmux split-window -t "$SESSION" -h -P -F '#{pane_id}' \
  'bash -c "exec -a agent sleep 300"')
sleep 0.3
$WORK scan --pane "$AGENT_PANE" --quiet

HOOK_JSON='{"hook_event_name":"sessionStart","conversation_id":"conv-test-1","cwd":"/tmp"}'
OUT=$(printf '%s' "$HOOK_JSON" | $WORK agent hook-event --pane "$AGENT_PANE" --json 2>&1)
assert_contains "sessionStart applies" '"applied": true' "$OUT"
assert_contains "sessionStart status idle" '"status": "idle"' "$OUT"

HOOK_JSON='{"hook_event_name":"preToolUse","conversation_id":"conv-test-1","tool_name":"Shell"}'
OUT=$(printf '%s' "$HOOK_JSON" | $WORK agent hook-event --pane "$AGENT_PANE" --json 2>&1)
assert_contains "preToolUse working" '"status": "working"' "$OUT"

OUT=$($WORK agents --json 2>&1)
assert_contains "agent confidence explicit" '"confidence": "explicit"' "$OUT"

section "3. Explicit status wins over manifest observe"
tmux select-pane -t "$AGENT_PANE" -T '⢀ working'
OUT=$(printf '%s' '{"hook_event_name":"postToolUse","conversation_id":"conv-test-1"}' \
  | $WORK agent hook-event --pane "$AGENT_PANE" --json 2>&1)
assert_contains "postToolUse idle explicit" '"status": "idle"' "$OUT"

BEFORE=$($WORK agent observe "$AGENT_PANE" --json 2>&1)
$WORK agent observe "$AGENT_PANE" --apply --json >/dev/null 2>&1 || true
AFTER=$($WORK agents --json 2>&1)
assert_contains "observe apply does not drop explicit" '"confidence": "explicit"' "$AFTER"
assert_contains "idle explicit preserved" '"status": "idle"' "$AFTER"

section "4. Permission denied maps to blocked"
OUT=$(printf '%s' '{"hook_event_name":"postToolUseFailure","conversation_id":"conv-test-1","failure_type":"permission_denied"}' \
  | $WORK agent hook-event --pane "$AGENT_PANE" --json 2>&1)
assert_contains "permission_denied blocked" '"status": "blocked"' "$OUT"

section "5. Bundled hook script installed by hooks install (dry-run)"
OUT=$($WORK hooks install cursor --dry-run 2>&1)
assert_contains "dry-run mentions work-event.sh" "work-event.sh" "$OUT"

section "Summary"
echo "Passed: $PASS"
echo "Failed: $FAIL"
if [[ "$FAIL" -eq 0 ]]; then
  echo "All Phase 6 tests passed."
  exit 0
fi
exit 1
