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
# Keep tests hermetic: never auto-detect a locally installed herdr binary.
export WORK_HERDR_BIN="off"
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

section "5. Follow-up prompt is idle (not working)"
FOLLOW_PANE=$(tmux split-window -t "$SESSION" -h -P -F '#{pane_id}' \
  'bash -c "exec -a cursor sh -c \"printf \\\"Add a follow-up\\\\nctrl+c to stop\\\\n\\\"; sleep 300\""')
sleep 0.3
$WORK scan --pane "$FOLLOW_PANE" --quiet
sleep 1
HOOK_JSON='{"hook_event_name":"preToolUse","conversation_id":"conv-follow-1","tool_name":"Shell"}'
printf '%s' "$HOOK_JSON" | $WORK agent hook-event --pane "$FOLLOW_PANE" --json >/dev/null
$WORK agent observe "$FOLLOW_PANE" --apply --quiet
OUT=$($WORK agents --json 2>&1)
assert_contains "follow-up clears explicit working to idle" '"status": "idle"' "$OUT"

section "6. Stale restored titles are not agents"
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

section "6b. Stale labeled shell with agent scrollback is not an agent"
STALE_LABELED_PANE=$(tmux split-window -t "$SESSION" -h -P -F '#{pane_id}' \
  'bash -c "printf \"Add a follow-up\\nComposer 2.5\\n\"; sleep 300"')
sleep 0.2
tmux set-option -p -t "$STALE_LABELED_PANE" @work-agent-label stale-labeled
OUT=$($WORK scan --pane "$STALE_LABELED_PANE" 2>&1)
if [[ "$OUT" != *"found"* ]]; then
  pass "stale labeled shell without agent process is not registered"
else
  fail "stale labeled shell without agent process is not registered (output: $OUT)"
fi

section "7. status summary counts"
OUT=$($WORK status 2>&1)
assert_contains "status reports working agents" "working" "$OUT"

ZOMBIE_SESSION="${SESSION_PREFIX}-zombie-$$"
tmux kill-session -t "$ZOMBIE_SESSION" 2>/dev/null || true
tmux new-session -d -s "$ZOMBIE_SESSION"
$WORK track "$ZOMBIE_SESSION" --quiet
AGENT_PANE=$(tmux split-window -t "$ZOMBIE_SESSION" -h -P -F '#{pane_id}' \
  'bash -c "exec -a cursor sleep 300"')
sleep 0.3
$WORK scan --pane "$AGENT_PANE" --quiet
$WORK agent detach "$AGENT_PANE" --quiet
OUT=$($WORK status --session "$ZOMBIE_SESSION" --format tmux 2>&1)
if [[ -z "$OUT" ]]; then
  pass "status omits detached agents without live panes"
else
  fail "status omits detached agents without live panes (got '$OUT')"
fi
tmux kill-session -t "$ZOMBIE_SESSION" 2>/dev/null || true

IDLE_SESSION="${SESSION_PREFIX}-idle-$$"
tmux kill-session -t "$IDLE_SESSION" 2>/dev/null || true
tmux new-session -d -s "$IDLE_SESSION"
$WORK track "$IDLE_SESSION" --quiet
IDLE_PANE=$(tmux split-window -t "$IDLE_SESSION" -h -P -F '#{pane_id}' \
  'bash -c "exec -a cursor sleep 300"')
sleep 0.3
$WORK scan --pane "$IDLE_PANE" --quiet
printf '{"hook_event_name":"stop","conversation_id":"conv-idle-status"}' \
  | $WORK agent hook-event --pane "$IDLE_PANE" --json >/dev/null
WINDOW_ID=$(tmux list-panes -t "$IDLE_PANE" -F '#{window_id}' | head -1)
OUT=$($WORK status --session "$IDLE_SESSION" --format tmux 2>&1)
assert_contains "status reports idle agents" "– 1" "$OUT"

WORK_SESSION="${SESSION_PREFIX}-session-scope-$$"
tmux kill-session -t "$WORK_SESSION" 2>/dev/null || true
tmux new-session -d -s "$WORK_SESSION"
$WORK track "$WORK_SESSION" --quiet
BUSY_PANE=$(tmux split-window -t "$WORK_SESSION" -h -P -F '#{pane_id}' \
  'bash -c "exec -a cursor sleep 300"')
sleep 0.3
$WORK scan --pane "$BUSY_PANE" --quiet
tmux select-pane -t "$BUSY_PANE" -T '⢀ working'
$WORK agent observe "$BUSY_PANE" --apply --quiet
IDLE_WIN=$(tmux new-window -t "$WORK_SESSION" -P -F '#{window_id}' \
  'bash -c "exec -a cursor sh -c \"printf \\\">\\\\n\\\"; sleep 300\""')
sleep 0.3
IDLE_WIN_PANE=$(tmux list-panes -t "$IDLE_WIN" -F '#{pane_id}' | head -1)
$WORK scan --pane "$IDLE_WIN_PANE" --quiet
printf '{"hook_event_name":"stop","conversation_id":"conv-scope-idle"}' \
  | $WORK agent hook-event --pane "$IDLE_WIN_PANE" --json >/dev/null
OUT=$($WORK status --session "$WORK_SESSION" --format tmux 2>&1)
assert_contains "status session scope counts idle window" "– 1" "$OUT"
assert_contains "status session scope counts working window" "⟳" "$OUT"
tmux kill-session -t "$WORK_SESSION" 2>/dev/null || true
tmux kill-session -t "$IDLE_SESSION" 2>/dev/null || true

section "8. herdr detection backend"
HERDR_STUB="$TEST_ROOT/herdr-stub"
cat > "$HERDR_STUB" <<'STUB'
#!/usr/bin/env bash
# Minimal stand-in for `herdr agent explain --file F --agent L --json`.
file=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --file) file="$2"; shift 2 ;;
    *) shift ;;
  esac
done
content=$(cat "$file" 2>/dev/null || true)
if [[ "$content" == *"HERDR-SKIP"* ]]; then
  echo '{"state":"unknown","skip_state_update":true,"fallback_reason":null,"matched_rule":{"id":"viewer","priority":1000,"state":"unknown"}}'
elif [[ "$content" == *"HERDR-BLOCKED"* ]]; then
  echo '{"state":"blocked","skip_state_update":false,"fallback_reason":null,"matched_rule":{"id":"bash_permission_prompt","priority":850,"state":"blocked"},"visible_blocker":true,"visible_idle":false,"evaluated_rules":[{"id":"bash_permission_prompt","evidence":{"region_preview":"\nHERDR-BLOCKED rm -rf build/\n"}}]}'
else
  echo '{"state":"idle","skip_state_update":false,"fallback_reason":"default_known_agent_idle_fallback","matched_rule":null}'
fi
STUB
chmod +x "$HERDR_STUB"

HERDR_PANE=$(tmux new-window -t "$SESSION" -P -F '#{pane_id}' \
  'bash -c "exec -a cursor sh -c \"printf \\\"HERDR-BLOCKED\\\\n\\\"; sleep 300\""')
sleep 0.3
$WORK scan --pane "$HERDR_PANE" --quiet

OUT=$(WORK_HERDR_BIN="$HERDR_STUB" $WORK agent observe "$HERDR_PANE" --json 2>&1)
assert_contains "herdr match wins over manifests" '"status": "blocked"' "$OUT"
assert_contains "herdr result tagged with source" '"source": "herdr"' "$OUT"
assert_contains "herdr rule priority propagated" '"rulePriority": 850' "$OUT"
assert_contains "herdr rule id propagated" '"ruleId": "bash_permission_prompt"' "$OUT"
assert_contains "herdr visible blocker propagated" '"visibleBlocker": true' "$OUT"
assert_contains "herdr evidence snippet propagated" '"evidence": "HERDR-BLOCKED rm -rf build/"' "$OUT"

WORK_HERDR_BIN="$HERDR_STUB" $WORK agent observe "$HERDR_PANE" --apply --quiet
OUT=$($WORK agents --json 2>&1)
assert_contains "agent record stores status reason" '"statusReason": "bash_permission_prompt"' "$OUT"
assert_contains "agent record stores visible blocker" '"visibleBlocker": true' "$OUT"

SKIP_PANE=$(tmux new-window -t "$SESSION" -P -F '#{pane_id}' \
  'bash -c "exec -a cursor sh -c \"printf \\\"run this command? HERDR-SKIP\\\\n\\\"; sleep 300\""')
sleep 0.3
$WORK scan --pane "$SKIP_PANE" --quiet

OUT=$(WORK_HERDR_BIN="$HERDR_STUB" $WORK agent observe "$SKIP_PANE" --json 2>&1)
assert_contains "herdr skip_state_update suppresses observation" '"observed": null' "$OUT"

FALLBACK_PANE=$(tmux new-window -t "$SESSION" -P -F '#{pane_id}' \
  'bash -c "exec -a cursor sh -c \"printf \\\"run this command?\\\\n\\\"; sleep 300\""')
sleep 0.3
$WORK scan --pane "$FALLBACK_PANE" --quiet

OUT=$(WORK_HERDR_BIN="$HERDR_STUB" $WORK agent observe "$FALLBACK_PANE" --json 2>&1)
assert_contains "herdr silence falls back to manifests" '"source": "manifest"' "$OUT"
assert_contains "manifest fallback still detects blocked" '"status": "blocked"' "$OUT"
assert_contains "manifest rules propagate visible blocker" '"visibleBlocker": true' "$OUT"

OUT=$(WORK_HERDR_BIN=off $WORK agent observe "$FALLBACK_PANE" --json 2>&1)
assert_contains "WORK_HERDR_BIN=off disables backend" '"source": "manifest"' "$OUT"

OUT=$(WORK_HERDR_BIN=/nonexistent/herdr $WORK agent observe "$FALLBACK_PANE" --json 2>&1)
assert_contains "broken herdr binary falls back to manifests" '"source": "manifest"' "$OUT"

section "Summary"
echo "Passed: $PASS"
echo "Failed: $FAIL"
if [[ "$FAIL" -gt 0 ]]; then exit 1; fi
echo "All Phase 5 tests passed."
