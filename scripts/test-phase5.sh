#!/usr/bin/env bash
# Phase 5 automated tests: Cursor status adapter and manifest engine.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKCTL_DIR="${WORKCTL_DIR:-$ROOT}"
WORKCTL="node $WORKCTL_DIR/dist/workctl.mjs"

SESSION_PREFIX="workctl-autotest-status"
SESSION="${SESSION_PREFIX}-$$"

TEST_ROOT="$(mktemp -d "/tmp/workctl-test-phase5-XXXXXX")"
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
cd "$WORKCTL_DIR"
npm run build >/dev/null

OUT=$($WORKCTL agent --help 2>&1)
assert_contains "help lists agent observe" "observe" "$OUT"

if [[ -f "$WORKCTL_DIR/dist/manifests/cursor.toml" ]]; then
  pass "bundled cursor manifest copied to dist"
else
  fail "bundled cursor manifest copied to dist"
fi

section "2. Track agent and title-based observation"
tmux kill-session -t "$SESSION" 2>/dev/null || true
tmux new-session -d -s "$SESSION"
$WORKCTL track "$SESSION" --quiet

AGENT_PANE=$(tmux split-window -t "$SESSION" -h -P -F '#{pane_id}' \
  'bash -c "exec -a cursor sleep 300"')
sleep 0.3
$WORKCTL scan --pane "$AGENT_PANE" --quiet

tmux select-pane -t "$AGENT_PANE" -T '⢀ working'
OUT=$($WORKCTL agent observe "$AGENT_PANE" --json 2>&1)
assert_contains "title braille matches working" '"status": "working"' "$OUT"
assert_contains "title match is inferred" '"confidence": "inferred"' "$OUT"

$WORKCTL agent observe "$AGENT_PANE" --apply --quiet
$WORKCTL agent title-changed "$AGENT_PANE" --quiet
OUT=$($WORKCTL agents --json 2>&1)
assert_contains "applied working status in workspace" '"status": "working"' "$OUT"

section "3. Screen content heuristics"
BLOCK_PANE=$(tmux split-window -t "$SESSION" -h -P -F '#{pane_id}' \
  'bash -c "exec -a cursor sh -c \"printf \\\"run this command?\\\\n\\\"; sleep 300\""')
sleep 0.3
$WORKCTL scan --pane "$BLOCK_PANE" --quiet

OUT=$($WORKCTL agent observe "$BLOCK_PANE" --json 2>&1)
assert_contains "screen approval prompt matches blocked" '"status": "blocked"' "$OUT"
assert_contains "screen match is heuristic" '"confidence": "heuristic"' "$OUT"

section "4. Idle debounce on apply"
IDLE_PANE=$(tmux split-window -t "$SESSION" -h -P -F '#{pane_id}' \
  'bash -c "exec -a cursor sh -c \"printf \\\">\\\\n\\\"; sleep 300\""')
sleep 0.3
$WORKCTL scan --pane "$IDLE_PANE" --quiet

tmux select-pane -t "$IDLE_PANE" -T '⢀ busy'
$WORKCTL agent observe "$IDLE_PANE" --apply --quiet
tmux select-pane -t "$IDLE_PANE" -T 'ready'

$WORKCTL agent observe "$IDLE_PANE" --apply --quiet
$WORKCTL agent observe "$IDLE_PANE" --apply --quiet
OUT=$($WORKCTL agent observe "$IDLE_PANE" --apply --json 2>&1)
assert_contains "debounced idle applies after confirmations" '"status": "idle"' "$OUT"

section "5. Stale restored titles are not agents"
STALE_PANE=$(tmux split-window -t "$SESSION" -h -P -F '#{pane_id}' \
  'bash -c "sleep 300"')
sleep 0.2
tmux select-pane -t "$STALE_PANE" -T 'Pi Agent - ✅ Ready'
OUT=$($WORKCTL scan --pane "$STALE_PANE" 2>&1)
if [[ "$OUT" != *"found"* ]]; then
  pass "stale agent title without UI is not registered"
else
  fail "stale agent title without UI is not registered (output: $OUT)"
fi

section "6. status summary counts"
OUT=$($WORKCTL status 2>&1)
assert_contains "status reports working agents" "working" "$OUT"

section "Summary"
echo "Passed: $PASS"
echo "Failed: $FAIL"
if [[ "$FAIL" -gt 0 ]]; then exit 1; fi
echo "All Phase 5 tests passed."
