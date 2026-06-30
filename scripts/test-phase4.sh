#!/usr/bin/env bash
# Phase 4 automated tests: quick actions, trust, and action picker flag.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK_DIR="${WORK_DIR:-$ROOT}"
WORK="node $WORK_DIR/dist/work.mjs"

SESSION_PREFIX="work-autotest-actions"
SESSION="${SESSION_PREFIX}-$$"

TEST_ROOT="$(mktemp -d "/tmp/work-test-phase4-XXXXXX")"
export XDG_CONFIG_HOME="$TEST_ROOT/config"
export XDG_STATE_HOME="$TEST_ROOT/state"
export XDG_RUNTIME_DIR="$TEST_ROOT/runtime"
mkdir -p "$XDG_CONFIG_HOME" "$XDG_STATE_HOME" "$XDG_RUNTIME_DIR"
chmod 700 "$XDG_RUNTIME_DIR"

ACTIONS_DIR="$XDG_CONFIG_HOME/work/actions"
REPO="$TEST_ROOT/repos/demo"
TREE_DIR="$TEST_ROOT/trees/demo"

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
  tmux kill-session -t "${SESSION}-picker" 2>/dev/null || true
  tmux kill-session -t "${SESSION}-opt-in" 2>/dev/null || true
  tmux kill-session -t "${SESSION}-run" 2>/dev/null || true
  rm -rf "$TEST_ROOT"
}
trap cleanup EXIT

init_repo() {
  mkdir -p "$1"
  git -C "$1" init -b main >/dev/null
  git -C "$1" config user.email "test@example.com"
  git -C "$1" config user.name "Test"
  echo demo >"$1/README.md"
  git -C "$1" add README.md
  git -C "$1" commit -m "init" >/dev/null
}

section "1. Build & command smoke"
cd "$WORK_DIR"
npm run build >/dev/null

OUT=$($WORK --help 2>&1)
assert_contains "help lists action" "action" "$OUT"
assert_contains "help lists trust" "trust" "$OUT"

section "2. Global actions"
mkdir -p "$ACTIONS_DIR"
cat >"$ACTIONS_DIR/hello.toml" <<'EOF'
description = "Say hello"
command = "echo hello-$WORKSPACE"
EOF

OUT=$($WORK action list --json 2>&1)
assert_contains "global action listed" '"id": "hello"' "$OUT"

section "3. Trust and repo-local actions"
init_repo "$REPO"
mkdir -p "$REPO/.work/actions"
cat >"$REPO/.work/actions/test.toml" <<'EOF'
description = "Run demo test"
command = "echo test-$TREE_ROOT"
EOF

tmux kill-session -t "$SESSION" 2>/dev/null || true
tmux new-session -d -s "$SESSION" -c "$REPO"
$WORK track "$SESSION" --quiet
$WORK add-tree "$REPO" --session "$SESSION" --quiet

OUT=$($WORK action list --session "$SESSION" --json 2>&1)
assert_contains "untrusted repo action hidden" '"id": "hello"' "$OUT"
if [[ "$OUT" == *"demo/test"* ]]; then
  fail "untrusted repo action hidden (found demo/test)"
else
  pass "untrusted repo action hidden"
fi

$WORK trust add "$REPO" >/dev/null
OUT=$($WORK action list --session "$SESSION" --json 2>&1)
assert_contains "trusted repo action listed" '"id": "demo/test"' "$OUT"

section "4. Track without attach pickers"
PICKER_SESSION="${SESSION}-picker"
tmux kill-session -t "$PICKER_SESSION" 2>/dev/null || true
tmux new-session -d -s "$PICKER_SESSION"
$WORK track "$PICKER_SESSION" --quiet

REPO_FLAG=$(tmux show-option -t "$PICKER_SESSION" -v @work-repo-picker 2>/dev/null || echo "")
ACTION_FLAG=$(tmux show-option -t "$PICKER_SESSION" -v @work-action-picker 2>/dev/null || echo "")
if [[ -z "$REPO_FLAG" && -z "$ACTION_FLAG" ]]; then
  pass "track does not set attach picker flags"
else
  fail "track does not set attach picker flags (repo=$REPO_FLAG action=$ACTION_FLAG)"
fi

if ! $WORK config set prompt-actions-on-new true 2>&1; then
  pass "removed config key prompt-actions-on-new rejected"
else
  fail "removed config key prompt-actions-on-new rejected"
fi

section "5. action run"
RUN_SESSION="${SESSION}-run"
tmux kill-session -t "$RUN_SESSION" 2>/dev/null || true
tmux new-session -d -s "$RUN_SESSION" -c "$REPO"
$WORK track "$RUN_SESSION" --quiet
$WORK add-tree "$REPO" --session "$RUN_SESSION" --quiet
$WORK trust add "$REPO" >/dev/null

OUT=$($WORK action run hello --session "$RUN_SESSION" --quiet 2>&1)
if [[ -z "$OUT" ]]; then
  pass "action run succeeds"
else
  fail "action run succeeds (output: $OUT)"
fi

PANE_CMD=$(tmux list-panes -t "$RUN_SESSION" -F '#{pane_current_command}' | tail -1)
if [[ "$PANE_CMD" == *"echo"* || "$PANE_CMD" == *"sh"* ]]; then
  pass "action run created pane"
else
  fail "action run created pane (got '$PANE_CMD')"
fi

section "6. window use-repo"
SCAN_ROOT="$TEST_ROOT/scan"
PROJECT_BASE="$TEST_ROOT/tmuxr"
mkdir -p "$SCAN_ROOT/nested/org" "$PROJECT_BASE"
init_repo "$PROJECT_BASE/work"
init_repo "$SCAN_ROOT/nested/org/window-demo"
WINDOW_SESSION="${SESSION}-window"
tmux kill-session -t "$WINDOW_SESSION" 2>/dev/null || true
tmux new-session -d -s "$WINDOW_SESSION"
$WORK track "$WINDOW_SESSION" --quiet
$WORK add-tree "$PROJECT_BASE/work" --session "$WINDOW_SESSION" --quiet
$WORK config set repo-scan-dir "$SCAN_ROOT" >/dev/null

CHECKOUT="$PROJECT_BASE/window-demo"
WIN_ID=$(tmux list-windows -t "$WINDOW_SESSION" -F '#{window_id}' | head -1)
$WORK window use-repo "$SCAN_ROOT/nested/org/window-demo" \
  --session "$WINDOW_SESSION" --window "$WIN_ID" --quiet

PANE_PATH=$(tmux list-panes -t "$WINDOW_SESSION" -F '#{pane_current_path}' | head -1)
if [[ "$PANE_PATH" == "$CHECKOUT" ]]; then
  pass "window use-repo sets pane cwd to project checkout"
else
  fail "window use-repo sets pane cwd to project checkout (got '$PANE_PATH', want '$CHECKOUT')"
fi

if git -C "$CHECKOUT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  pass "window use-repo creates git worktree checkout"
else
  fail "window use-repo creates git worktree checkout"
fi

TREES=$($WORK trees --session "$WINDOW_SESSION" --json 2>&1)
assert_contains "window use-repo adds tree" "window-demo" "$TREES"

NESTED=$($WORK repos --format names 2>&1)
assert_contains "nested repo scan finds repo" "nested/org/window-demo" "$NESTED"

OUT=$($WORK config set prompt-repos-on-new-window true 2>&1)
assert_contains "config set prompt-repos-on-new-window" "prompt-repos-on-new-window" "$OUT"

section "7. Cleanup: multi scan dir, scan --pane, add-tree --open"
SCAN_A="$TEST_ROOT/scan-a/nested"
SCAN_B="$TEST_ROOT/scan-b"
mkdir -p "$SCAN_A" "$SCAN_B"
init_repo "$SCAN_A/repo-a"
init_repo "$SCAN_B/repo-b"
$WORK config set repo-scan-dir "$SCAN_A,$SCAN_B" >/dev/null

MULTI=$($WORK repos --format names 2>&1)
assert_contains "multi repo-scan-dir finds scan-a repo" "repo-a" "$MULTI"
assert_contains "multi repo-scan-dir finds scan-b repo" "scan-b/repo-b" "$MULTI"

FAST_SESSION="${SESSION}-fast"
tmux kill-session -t "$FAST_SESSION" 2>/dev/null || true
tmux new-session -d -s "$FAST_SESSION"
$WORK track "$FAST_SESSION" --quiet
PANE_ID=$(tmux list-panes -t "$FAST_SESSION" -F '#{pane_id}' | head -1)
tmux send-keys -t "$PANE_ID" "exec sh -c 'sleep 300'" Enter
sleep 0.3
$WORK scan --pane "$PANE_ID" --quiet 2>/dev/null || true
AGENTS=$($WORK agents --json 2>&1)
if [[ "$AGENTS" == *"$FAST_SESSION"* ]]; then
  fail "scan --pane does not register non-agent shell"
else
  pass "scan --pane ignores non-agent panes"
fi

OPEN_SESSION="${SESSION}-open"
TREE_PATH="$TEST_ROOT/open-tree"
init_repo "$TREE_PATH"
tmux kill-session -t "$OPEN_SESSION" 2>/dev/null || true
tmux new-session -d -s "$OPEN_SESSION"
$WORK track "$OPEN_SESSION" --quiet
BEFORE=$(tmux list-windows -t "$OPEN_SESSION" | wc -l)
$WORK add-tree "$TREE_PATH" --session "$OPEN_SESSION" --open --quiet
AFTER=$(tmux list-windows -t "$OPEN_SESSION" | wc -l)
if [[ "$AFTER" -gt "$BEFORE" ]]; then
  pass "add-tree --open creates a window"
else
  fail "add-tree --open creates a window"
fi
WIN_NAME=$(basename "$TREE_PATH")
WIN_CWD=$(tmux list-panes -t "$OPEN_SESSION:$WIN_NAME" -F '#{pane_current_path}' 2>/dev/null | head -1)
if [[ "$WIN_CWD" == "$TREE_PATH" ]]; then
  pass "add-tree --open window cwd matches tree"
else
  fail "add-tree --open window cwd matches tree (got '$WIN_CWD')"
fi

section "Summary"
TOTAL=$PASS
echo "Passed: $PASS"
echo "Failed: $FAIL"
if [[ "$FAIL" -gt 0 ]]; then exit 1; fi
echo "All Phase 4 tests passed."
