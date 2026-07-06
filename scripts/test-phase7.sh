#!/usr/bin/env bash
# Phase 7: Claude Code hook Tier 1 status integration.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK_DIR="${WORK_DIR:-$ROOT}"
WORK="node $WORK_DIR/dist/work.mjs"

SESSION_PREFIX="work-autotest-claude-hooks"
SESSION="${SESSION_PREFIX}-$$"

TEST_ROOT="$(mktemp -d "/tmp/work-test-phase7-XXXXXX")"
export XDG_CONFIG_HOME="$TEST_ROOT/config"
export XDG_STATE_HOME="$TEST_ROOT/state"
export XDG_RUNTIME_DIR="$TEST_ROOT/runtime"
# Keep tests hermetic: never auto-detect a locally installed herdr binary.
export WORK_HERDR_BIN="off"
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

section "1. Build & bundled Claude manifest"
cd "$WORK_DIR"
npm run build >/dev/null

if [[ -f "$WORK_DIR/dist/manifests/claude.toml" ]]; then
  pass "bundled claude manifest copied to dist"
else
  fail "bundled claude manifest copied to dist"
fi

OUT=$($WORK hooks install claude --help 2>&1)
assert_contains "help lists claude install" "install" "$OUT"

section "2. Claude PascalCase hook events"
tmux kill-session -t "$SESSION" 2>/dev/null || true
tmux new-session -d -s "$SESSION"
$WORK track "$SESSION" --quiet

AGENT_PANE=$(tmux split-window -t "$SESSION" -h -P -F '#{pane_id}' \
  'bash -c "exec -a claude sleep 300"')
sleep 0.3
$WORK scan --pane "$AGENT_PANE" --quiet

HOOK_JSON='{"hook_event_name":"SessionStart","session_id":"claude-sess-1","cwd":"/tmp"}'
OUT=$(printf '%s' "$HOOK_JSON" | $WORK agent hook-event --pane "$AGENT_PANE" --json 2>&1)
assert_contains "SessionStart applies" '"applied": true' "$OUT"
assert_contains "SessionStart status idle" '"status": "idle"' "$OUT"

HOOK_JSON='{"hook_event_name":"PreToolUse","session_id":"claude-sess-1","tool_name":"Bash"}'
OUT=$(printf '%s' "$HOOK_JSON" | $WORK agent hook-event --pane "$AGENT_PANE" --json 2>&1)
assert_contains "PreToolUse working" '"status": "working"' "$OUT"

HOOK_JSON='{"hook_event_name":"UserPromptSubmit","session_id":"claude-sess-1","prompt":"hi"}'
OUT=$(printf '%s' "$HOOK_JSON" | $WORK agent hook-event --pane "$AGENT_PANE" --json 2>&1)
assert_contains "UserPromptSubmit working" '"status": "working"' "$OUT"

OUT=$($WORK agents --json 2>&1)
assert_contains "agent confidence explicit" '"confidence": "explicit"' "$OUT"

section "3. Permission hooks map to blocked"
OUT=$(printf '%s' '{"hook_event_name":"PermissionRequest","session_id":"claude-sess-1","tool_name":"Bash"}' \
  | $WORK agent hook-event --pane "$AGENT_PANE" --json 2>&1)
assert_contains "PermissionRequest blocked" '"status": "blocked"' "$OUT"

section "4. Stop maps to idle"
OUT=$(printf '%s' '{"hook_event_name":"Stop","session_id":"claude-sess-1"}' \
  | $WORK agent hook-event --pane "$AGENT_PANE" --json 2>&1)
assert_contains "Stop idle" '"status": "idle"' "$OUT"

section "5. SessionEnd clear does not detach"
OUT=$(printf '%s' '{"hook_event_name":"SessionEnd","session_id":"claude-sess-1","reason":"clear"}' \
  | $WORK agent hook-event --pane "$AGENT_PANE" --json 2>&1)
assert_contains "SessionEnd clear skipped" '"applied": false' "$OUT"
OUT=$($WORK agents --json 2>&1)
assert_contains "agent still tracked after clear" '"paneId"' "$OUT"

section "6. Claude manifest heuristics"
HEUR_PANE=$(tmux split-window -t "$SESSION" -h -P -F '#{pane_id}' \
  'bash -c "exec -a claude sh -c \"printf \\\"esc to interrupt\\\\n\\\"; sleep 300\""')
sleep 0.3
$WORK scan --pane "$HEUR_PANE" --quiet
OUT=$($WORK agent observe "$HEUR_PANE" --json 2>&1)
assert_contains "esc to interrupt matches working" '"status": "working"' "$OUT"

section "7. hooks install claude dry-run"
OUT=$($WORK hooks install claude --dry-run 2>&1)
assert_contains "dry-run mentions claude work-event.sh" "work-event.sh" "$OUT"
assert_contains "dry-run mentions settings.json" "settings.json" "$OUT"

section "8. Hook script honors multi-word WORK_BIN from tmux"
HOOK_SH="$WORK_DIR/dist/hooks/claude/work-event.sh"
HOOK_JSON='{"hook_event_name":"PreToolUse","session_id":"claude-sess-1","tool_name":"Read"}'
tmux run-shell -t "$AGENT_PANE" \
  "WORK_BIN='node $WORK_DIR/dist/work.mjs' printf '%s' '$HOOK_JSON' | bash '$HOOK_SH'"
sleep 0.5
OUT=$($WORK agents --json 2>&1)
assert_contains "hook script with node WORK_BIN applies" '"status": "working"' "$OUT"

section "Summary"
echo "Passed: $PASS"
echo "Failed: $FAIL"
if [[ "$FAIL" -eq 0 ]]; then
  echo "All Phase 7 tests passed."
  exit 0
fi
exit 1
