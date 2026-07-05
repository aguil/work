#!/usr/bin/env bash
# Phase 1 automated tests: build, CLI, tracking, agents, reconcile, daemon.
#
# Safety: uses isolated XDG dirs and only creates/destroys its own tmux sessions.
# It will never kill sessions outside the work-autotest-* prefix.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK_DIR="${WORK_DIR:-$ROOT}"
WORK="node $WORK_DIR/dist/work.mjs"
WORKD="node $WORK_DIR/dist/workd.mjs"

SESSION_PREFIX="work-autotest"
SESSION="${SESSION_PREFIX}-$$"
SCRATCH="${SESSION_PREFIX}-scratch-$$"

# Isolated XDG dirs — does not touch ~/.config/work or the live daemon.
TEST_ROOT="$(mktemp -d "/tmp/work-test-XXXXXX")"
export XDG_CONFIG_HOME="$TEST_ROOT/config"
export XDG_STATE_HOME="$TEST_ROOT/state"
export XDG_RUNTIME_DIR="$TEST_ROOT/runtime"
mkdir -p "$XDG_CONFIG_HOME" "$XDG_STATE_HOME" "$XDG_RUNTIME_DIR"
chmod 700 "$XDG_RUNTIME_DIR"

STATE_DIR="$XDG_STATE_HOME/work"
RUNTIME_DIR="$XDG_RUNTIME_DIR/work"

# Sessions that must never be touched, even by accident.
PROTECTED_SESSIONS=(tmuxr)

CREATED_SESSIONS=()
DAEMON_PID=""
AGENT_PANE=""
KEEP_SESSIONS=false

PASS=0
FAIL=0
SKIP=0

usage() {
  cat <<EOF
Usage: $(basename "$0") [options]

Options:
  --keep-sessions   Leave autotest tmux sessions running after the run
  -h, --help        Show this help

The script only creates sessions named ${SESSION_PREFIX}-*.
Your existing sessions (including tmuxr) are never modified or killed.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --keep-sessions) KEEP_SESSIONS=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1"; usage; exit 1 ;;
  esac
done

pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }
skip() { echo "  SKIP: $1"; SKIP=$((SKIP + 1)); }

assert_eq() {
  local desc="$1" expected="$2" actual="$3"
  if [[ "$expected" == "$actual" ]]; then pass "$desc"
  else fail "$desc (expected '$expected', got '$actual')"; fi
}

assert_contains() {
  local desc="$1" needle="$2" haystack="$3"
  if [[ "$haystack" == *"$needle"* ]]; then pass "$desc"
  else fail "$desc (missing '$needle')"; fi
}

assert_file_exists() {
  local desc="$1" path="$2"
  if [[ -f "$path" ]]; then pass "$desc"
  else fail "$desc (missing $path)"; fi
}

assert_cmd_ok() {
  local desc="$1"; shift
  if "$@" >/dev/null 2>&1; then pass "$desc"
  else fail "$desc (command failed: $*)"; fi
}

section() { echo; echo "== $1 =="; }

is_protected_session() {
  local name="$1"
  for protected in "${PROTECTED_SESSIONS[@]}"; do
    [[ "$name" == "$protected" ]] && return 0
  done
  [[ "$name" != ${SESSION_PREFIX}* ]] && return 0
  return 1
}

register_session() {
  local name="$1"
  if is_protected_session "$name"; then
    echo "ERROR: refusing to register protected/non-test session: $name" >&2
    exit 1
  fi
  CREATED_SESSIONS+=("$name")
}

create_test_session() {
  local name="$1"
  if is_protected_session "$name"; then
    echo "ERROR: refusing to create session with unsafe name: $name" >&2
    exit 1
  fi
  tmux has-session -t "$name" 2>/dev/null && tmux kill-session -t "$name"
  tmux new-session -d -s "$name"
  register_session "$name"
}

kill_test_session() {
  local name="$1"
  if is_protected_session "$name"; then
    echo "ERROR: refusing to kill protected/non-test session: $name" >&2
    return 1
  fi
  tmux kill-session -t "$name" 2>/dev/null || true
}

cleanup() {
  if [[ "$KEEP_SESSIONS" == true ]]; then
    echo
    echo "Keeping test sessions: ${CREATED_SESSIONS[*]:-none}"
    echo "Test data dir: $TEST_ROOT"
  else
    for name in "${CREATED_SESSIONS[@]}"; do
      kill_test_session "$name"
    done
  fi

  if [[ -n "$DAEMON_PID" ]] && kill -0 "$DAEMON_PID" 2>/dev/null; then
    kill -TERM "$DAEMON_PID" 2>/dev/null || true
    wait "$DAEMON_PID" 2>/dev/null || true
  fi

  if [[ "$KEEP_SESSIONS" != true ]]; then
    rm -rf "$TEST_ROOT"
  fi
}
trap cleanup EXIT

require_tmux() {
  command -v tmux >/dev/null 2>&1 || { echo "tmux is required"; exit 1; }
}

echo "Test isolation:"
echo "  XDG_CONFIG_HOME=$XDG_CONFIG_HOME"
echo "  XDG_STATE_HOME=$XDG_STATE_HOME"
echo "  XDG_RUNTIME_DIR=$XDG_RUNTIME_DIR"
echo "  Test session: $SESSION"

# --- Section 1: Build & CLI smoke ---

section "1. Build & CLI smoke"
cd "$WORK_DIR"

assert_cmd_ok "npm install" npm install
assert_cmd_ok "npm run typecheck" npm run typecheck
assert_cmd_ok "npm run build" npm run build
assert_cmd_ok "work --help" $WORK --help

OUT=$($WORK config list 2>&1)
assert_contains "config lists agent-clis" "agent-clis" "$OUT"
assert_contains "config lists sidebar-width" "sidebar-width" "$OUT"

$WORK config set sidebar-width 35 >/dev/null
WIDTH=$($WORK config get sidebar-width 2>&1)
assert_eq "config set/get sidebar-width" "35" "$WIDTH"

OUT=$($WORK list 2>&1)
assert_contains "list on empty isolated state" "No tracked workspaces" "$OUT"

OUT=$($WORK agents 2>&1)
assert_contains "agents on empty isolated state" "No agents found" "$OUT"

OUT=$($WORK status 2>&1)
assert_contains "status on empty isolated state" "No agents" "$OUT"

# --- Section 2: Workspace tracking ---

section "2. Workspace tracking"
require_tmux

create_test_session "$SESSION"

OUT=$($WORK track "$SESSION" 2>&1)
assert_contains "track session" "Tracking session" "$OUT"
assert_file_exists "workspace state file" "$STATE_DIR/workspaces/${SESSION}.json"

WS_OPT=$(tmux show-option -t "$SESSION" -v @work-workspace 2>&1)
assert_eq "session @work-workspace option" "$SESSION" "$WS_OPT"

OUT=$($WORK track "$SESSION" 2>&1)
assert_contains "track idempotent" "already tracked" "$OUT"

OUT=$($WORK list --json 2>&1)
assert_contains "list --json includes session" "\"sessionName\": \"$SESSION\"" "$OUT"

# --- Section 3: Agent detection & management ---

section "3. Agent detection & management"

AGENT_PANE=$(tmux split-window -t "$SESSION" -h -P -F '#{pane_id}' \
  'bash -c "exec -a cursor sleep 120"')
sleep 0.3

OUT=$($WORK scan --session "$SESSION" 2>&1)
assert_contains "scan detects agent" "found cursor" "$OUT"

OUT=$($WORK agents 2>&1)
assert_contains "agents lists cursor" "cursor" "$OUT"

LABEL_OPT=$(tmux show-option -p -t "$AGENT_PANE" -v @work-agent-label 2>&1)
assert_eq "pane @work-agent-label set" "cursor" "$LABEL_OPT"

$WORK agent label "$AGENT_PANE" my-agent >/dev/null
OUT=$($WORK agents 2>&1)
assert_contains "agent label rename" "my-agent" "$OUT"

# Sidebar exclusion: mark a plain bash pane as sidebar (no interactive TUI needed)
SIDEBAR_PANE=$(tmux split-window -t "$SESSION" -h -l 20 -P -F '#{pane_id}' \
  'sleep 120')
tmux set-option -p -t "$SIDEBAR_PANE" @work-sidebar 1
sleep 0.2

OUT=$($WORK scan --session "$SESSION" 2>&1)
AGENT_COUNT=$(echo "$OUT" | grep -c 'found ' || true)
if [[ "$AGENT_COUNT" -le 1 ]]; then
  pass "sidebar-marked pane not scanned as new agent"
else
  fail "sidebar-marked pane scanned as agent (found lines: $AGENT_COUNT)"
fi

tmux kill-pane -t "$SIDEBAR_PANE" 2>/dev/null || true

# Untracked session scan (separate throwaway session)
create_test_session "$SCRATCH"
tmux split-window -t "$SCRATCH" -h \
  'bash -c "exec -a cursor sleep 60"' >/dev/null
sleep 0.3
OUT=$($WORK scan --all 2>&1)
assert_contains "scan --all reports untracked" "[untracked]" "$OUT"
kill_test_session "$SCRATCH"
CREATED_SESSIONS=("${CREATED_SESSIONS[@]/$SCRATCH}")

$WORK agent detach "$AGENT_PANE" >/dev/null
OUT=$($WORK agents 2>&1)
assert_contains "agent detach marks detached" "detached" "$OUT"

tmux kill-pane -t "$AGENT_PANE" 2>/dev/null || true
AGENT_PANE=""

# --- Section 4: Reconcile & status (test workspace only) ---

section "4. Reconcile & status"

AGENT_PANE=$(tmux split-window -t "$SESSION" -h -P -F '#{pane_id}' \
  'bash -c "exec -a cursor sleep 120"')
sleep 0.3
$WORK scan --session "$SESSION" --quiet

tmux set-option -t "$SESSION" -u @work-workspace 2>/dev/null || true
if $WORK session hydrate "$SESSION" --quiet 2>/dev/null; then
  pass "session hydrate restores @work-workspace"
else
  fail "session hydrate restores @work-workspace"
fi
WS_OPT=$(tmux show-option -t "$SESSION" -v @work-workspace 2>&1)
assert_eq "hydrated @work-workspace value" "$SESSION" "$WS_OPT"

# reconcile --all is safe here: isolated state dir contains only this test workspace
tmux set-option -t "$SESSION" -u @work-workspace 2>/dev/null || true
OUT=$($WORK reconcile --all 2>&1)
assert_contains "reconcile completes" "Reconcile complete" "$OUT"
WS_OPT=$(tmux show-option -t "$SESSION" -v @work-workspace 2>&1)
assert_eq "reconcile restores @work-workspace" "$SESSION" "$WS_OPT"

OUT=$($WORK status 2>&1)
assert_contains "status shows agents" "agent" "$OUT"

assert_cmd_ok "status --format tmux runs" $WORK status --format tmux

$WORK agent detach "$AGENT_PANE" --quiet
OUT=$($WORK reconcile --all 2>&1)
assert_contains "reconcile re-attaches agent" "re-attached" "$OUT"

# --- Section 5: Daemon lifecycle (isolated runtime) ---

section "5. Daemon lifecycle"

$WORKD >"$RUNTIME_DIR/test-daemon.log" 2>&1 &
DAEMON_PID=$!

for _ in $(seq 1 20); do
  [[ -S "$RUNTIME_DIR/work.sock" ]] && break
  sleep 0.1
done

for _ in $(seq 1 20); do
  [[ -f "$RUNTIME_DIR/workd.pid" ]] && break
  sleep 0.1
done

assert_file_exists "daemon writes PID file" "$RUNTIME_DIR/workd.pid"
if [[ -S "$RUNTIME_DIR/work.sock" ]]; then
  pass "daemon creates Unix socket"
else
  fail "daemon creates Unix socket"
fi

if $WORKD >/dev/null 2>&1; then
  fail "second daemon start rejected"
else
  pass "second daemon start rejected"
fi

assert_cmd_ok "CLI works while test daemon running" $WORK list

kill -TERM "$DAEMON_PID" 2>/dev/null || true
wait "$DAEMON_PID" 2>/dev/null || true
DAEMON_PID=""

if [[ ! -f "$RUNTIME_DIR/workd.pid" ]]; then
  pass "daemon cleans up PID file on shutdown"
else
  fail "daemon cleans up PID file on shutdown"
fi

# --- Section 6: Untrack ---

section "6. Untrack"

OUT=$($WORK untrack "$SESSION" 2>&1)
assert_contains "untrack workspace" "Untracked" "$OUT"

if [[ ! -f "$STATE_DIR/workspaces/${SESSION}.json" ]]; then
  pass "untrack removes state file"
else
  fail "untrack removes state file"
fi

# Test --auto archive on a fresh throwaway session
ARCHIVE_SESSION="${SESSION_PREFIX}-archive-$$"
create_test_session "$ARCHIVE_SESSION"
$WORK track "$ARCHIVE_SESSION" --quiet
kill_test_session "$ARCHIVE_SESSION"
sleep 0.2
$WORK untrack "$ARCHIVE_SESSION" --auto --quiet

if [[ -f "$STATE_DIR/workspaces/${ARCHIVE_SESSION}.json" ]]; then
  if grep -q '"archived": true' "$STATE_DIR/workspaces/${ARCHIVE_SESSION}.json"; then
    pass "untrack --auto archives workspace"
  else
    fail "untrack --auto archives workspace"
  fi
else
  skip "untrack --auto archives workspace (state file removed)"
fi
CREATED_SESSIONS=("${CREATED_SESSIONS[@]/$ARCHIVE_SESSION}")

# Main test session already untracked; remove from cleanup kill list if kept
if [[ "$KEEP_SESSIONS" != true ]]; then
  kill_test_session "$SESSION"
fi
CREATED_SESSIONS=()

# --- Summary ---

section "Summary"
TOTAL=$((PASS + FAIL + SKIP))
echo "Passed: $PASS / $TOTAL"
echo "Failed: $FAIL"
echo "Skipped: $SKIP"

if [[ "$FAIL" -gt 0 ]]; then exit 1; fi
echo "All Phase 1 tests passed."
