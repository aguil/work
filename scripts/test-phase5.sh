#!/usr/bin/env bash
# Phase 5 automated tests: Cursor status adapter and manifest engine.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK_DIR="${WORK_DIR:-$ROOT}"
WORK="node $WORK_DIR/dist/work.mjs"

SESSION_PREFIX="work-autotest-status"
SESSION="${SESSION_PREFIX}-$$"

TEST_ROOT="$(mktemp -d "/tmp/work-test-phase5-XXXXXX")"
export XDG_CONFIG_HOME="$TEST_ROOT/config"
export XDG_STATE_HOME="$TEST_ROOT/state"
export XDG_RUNTIME_DIR="$TEST_ROOT/runtime"
mkdir -p "$XDG_CONFIG_HOME" "$XDG_STATE_HOME" "$XDG_RUNTIME_DIR"
chmod 700 "$XDG_RUNTIME_DIR"

PASS=0
FAIL=0

pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }
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

section "1. Build & manifest smoke"
cd "$WORK_DIR"
npm run build >/dev/null

OUT=$($WORK agent --help 2>&1)
assert_contains "help lists agent observe" "observe" "$OUT"

if [[ -f "$WORK_DIR/dist/manifests/cursor.toml" ]]; then
  pass "bundled cursor manifest copied to dist"
else
  fail "bundled cursor manifest copied to dist"
fi

section "2. Track agent and title-based observation"
tmux kill-session -t "$SESSION" 2>/dev/null || true
tmux new-session -d -s "$SESSION"
$WORK track "$SESSION" --quiet

AGENT_PANE=$(tmux split-window -t "$SESSION" -h -P -F '#{pane_id}' \
  'bash -c "exec -a cursor sleep 300"')
sleep 0.3
$WORK scan --pane "$AGENT_PANE" --quiet

tmux select-pane -t "$AGENT_PANE" -T '⢀ working'
OUT=$($WORK agent observe "$AGENT_PANE" --json 2>&1)
assert_contains "title braille matches working" '"status": "working"' "$OUT"
assert_contains "title match is inferred" '"confidence": "inferred"' "$OUT"

$WORK agent observe "$AGENT_PANE" --apply --quiet
$WORK agent title-changed "$AGENT_PANE" --quiet
OUT=$($WORK agents --json 2>&1)
assert_contains "applied working status in workspace" '"status": "working"' "$OUT"

section "3. Screen content heuristics"
BLOCK_PANE=$(tmux split-window -t "$SESSION" -h -P -F '#{pane_id}' \
  'bash -c "exec -a cursor sh -c \"printf \\\"run this command?\\\\n\\\"; sleep 300\""')
sleep 0.3
$WORK scan --pane "$BLOCK_PANE" --quiet

OUT=$($WORK agent observe "$BLOCK_PANE" --json 2>&1)
assert_contains "screen approval prompt matches blocked" '"status": "blocked"' "$OUT"
assert_contains "screen match is heuristic" '"confidence": "heuristic"' "$OUT"

section "4. Idle debounce on apply"
IDLE_PANE=$(tmux split-window -t "$SESSION" -h -P -F '#{pane_id}' \
  'bash -c "exec -a cursor sh -c \"printf \\\">\\\\n\\\"; sleep 300\""')
sleep 0.3
$WORK scan --pane "$IDLE_PANE" --quiet

tmux select-pane -t "$IDLE_PANE" -T '⢀ busy'
$WORK agent observe "$IDLE_PANE" --apply --quiet
tmux select-pane -t "$IDLE_PANE" -T 'ready'

$WORK agent observe "$IDLE_PANE" --apply --quiet
$WORK agent observe "$IDLE_PANE" --apply --quiet
OUT=$($WORK agent observe "$IDLE_PANE" --apply --json 2>&1)
assert_contains "debounced idle applies after confirmations" '"status": "idle"' "$OUT"

section "5. Stale restored titles are not agents"
STALE_PANE=$(tmux split-window -t "$SESSION" -h -P -F '#{pane_id}' \
  'bash -c "sleep 300"')
sleep 0.2
tmux select-pane -t "$STALE_PANE" -T 'Pi Agent - ✅ Ready'
OUT=$($WORK scan --pane "$STALE_PANE" 2>&1)
if [[ "$OUT" != *"found"* ]]; then
  pass "stale agent title without UI is not registered"
else
  fail "stale agent title without UI is not registered (output: $OUT)"
fi

section "6. status summary counts"
OUT=$($WORK status 2>&1)
assert_contains "status reports working agents" "working" "$OUT"

section "Summary"
echo "Passed: $PASS"
echo "Failed: $FAIL"
if [[ "$FAIL" -gt 0 ]]; then exit 1; fi
echo "All Phase 5 tests passed."
