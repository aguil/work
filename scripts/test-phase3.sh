#!/usr/bin/env bash
# Phase 3 automated tests: workspace creation, close, launch, relaunch.
#
# Safety: uses isolated XDG dirs and only creates/destroys its own tmux sessions.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKCTL_DIR="${WORKCTL_DIR:-$ROOT}"
WORKCTL="node $WORKCTL_DIR/dist/workctl.mjs"

SESSION_PREFIX="workctl-autotest-phase3"
WORKSPACE="${SESSION_PREFIX}-$$"

TEST_ROOT="$(mktemp -d "/tmp/workctl-test-phase3-XXXXXX")"
export XDG_CONFIG_HOME="$TEST_ROOT/config"
export XDG_STATE_HOME="$TEST_ROOT/state"
export XDG_RUNTIME_DIR="$TEST_ROOT/runtime"
mkdir -p "$XDG_CONFIG_HOME" "$XDG_STATE_HOME" "$XDG_RUNTIME_DIR"
chmod 700 "$XDG_RUNTIME_DIR"

STATE_DIR="$XDG_STATE_HOME/workctl"
REPOS_DIR="$TEST_ROOT/repos"
DEST_BASE="$TEST_ROOT/workspaces/$WORKSPACE"
FRONTEND_REPO="$REPOS_DIR/frontend"
BACKEND_REPO="$REPOS_DIR/backend"
FRONTEND_TREE="$DEST_BASE/frontend"
BACKEND_TREE="$DEST_BASE/backend"

PASS=0
FAIL=0
SKIP=0

pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }
skip() { echo "  SKIP: $1"; SKIP=$((SKIP + 1)); }

assert_contains() {
  local desc="$1" needle="$2" haystack="$3"
  if [[ "$haystack" == *"$needle"* ]]; then pass "$desc"
  else fail "$desc (missing '$needle')"; fi
}

section() { echo; echo "== $1 =="; }

cleanup() {
  tmux kill-session -t "$WORKSPACE" 2>/dev/null || true
  rm -rf "$TEST_ROOT"
}
trap cleanup EXIT

require_tmux() {
  command -v tmux >/dev/null 2>&1 || { echo "tmux is required"; exit 1; }
}

require_git() {
  command -v git >/dev/null 2>&1 || { echo "git is required"; exit 1; }
}

init_repo() {
  local path="$1"
  mkdir -p "$path"
  git -C "$path" init -b main >/dev/null
  git -C "$path" config user.email "test@example.com"
  git -C "$path" config user.name "Test"
  echo "demo" >"$path/README.md"
  git -C "$path" add README.md
  git -C "$path" commit -m "init" >/dev/null
}

echo "Test isolation:"
echo "  XDG_STATE_HOME=$XDG_STATE_HOME"
echo "  Workspace: $WORKSPACE"

section "1. Build & command smoke"
cd "$WORKCTL_DIR"
npm run build >/dev/null

OUT=$($WORKCTL --help 2>&1)
assert_contains "help lists new" "new" "$OUT"
assert_contains "help lists close" "close" "$OUT"
assert_contains "help lists launch" "launch" "$OUT"

section "2. workctl new (non-interactive)"
require_tmux
require_git

init_repo "$FRONTEND_REPO"
init_repo "$BACKEND_REPO"

$WORKCTL config set repo-scan-dir "$REPOS_DIR" >/dev/null

OUT=$(
  $WORKCTL new "$WORKSPACE" \
    --repos "$FRONTEND_REPO,$BACKEND_REPO" \
    --branch feature-test \
    --dest-base "$DEST_BASE" \
    --no-attach \
    --quiet 2>&1
)
if tmux has-session -t "$WORKSPACE" 2>/dev/null; then
  pass "new --quiet succeeds"
else
  fail "new --quiet succeeds (output: $OUT)"
fi

if tmux has-session -t "$WORKSPACE" 2>/dev/null; then
  pass "new creates tmux session"
else
  fail "new creates tmux session"
fi

if [[ -d "$FRONTEND_TREE/.git" || -f "$FRONTEND_TREE/.git" ]]; then
  pass "new creates frontend worktree"
else
  fail "new creates frontend worktree"
fi

if [[ -d "$BACKEND_TREE/.git" || -f "$BACKEND_TREE/.git" ]]; then
  pass "new creates backend worktree"
else
  fail "new creates backend worktree"
fi

OUT=$($WORKCTL list --json 2>&1)
assert_contains "list includes workspace" "\"name\": \"$WORKSPACE\"" "$OUT"

OUT=$($WORKCTL trees --session "$WORKSPACE" --json 2>&1)
assert_contains "trees lists frontend" "$FRONTEND_TREE" "$OUT"
assert_contains "trees lists backend" "$BACKEND_TREE" "$OUT"

if grep -q '"createdByWorkctl": true' "$STATE_DIR/workspaces/${WORKSPACE}.json"; then
  pass "workspace marks createdByWorkctl trees"
else
  fail "workspace marks createdByWorkctl trees"
fi

WINDOW_COUNT=$(tmux list-windows -t "$WORKSPACE" | wc -l | tr -d ' ')
if [[ "$WINDOW_COUNT" -eq 2 ]]; then
  pass "new creates one window per repo"
else
  fail "new creates one window per repo (got $WINDOW_COUNT)"
fi

section "3. workctl launch & agent relaunch"
$WORKCTL config set agent-clis sleep,bash >/dev/null 2>&1 || true

PANE=$(tmux list-panes -t "$WORKSPACE" -F '#{pane_id}' | head -1)
OUT=$($WORKCTL launch "sleep 9999" --session "$WORKSPACE" --pane "$PANE" --label sleeper --quiet 2>&1)
if [[ -z "$OUT" ]]; then
  pass "launch registers agent"
else
  fail "launch registers agent (output: $OUT)"
fi

OUT=$($WORKCTL agents --json 2>&1)
assert_contains "agents lists sleeper" '"label": "sleeper"' "$OUT"

tmux kill-pane -t "$PANE" 2>/dev/null || true
$WORKCTL agent detach "$PANE" --quiet 2>/dev/null || true

OUT=$($WORKCTL agent relaunch sleeper --session "$WORKSPACE" --quiet 2>&1)
if [[ -z "$OUT" ]]; then
  pass "agent relaunch succeeds"
else
  fail "agent relaunch succeeds (output: $OUT)"
fi

OUT=$($WORKCTL agents --json 2>&1)
assert_contains "relaunched agent is not detached" '"status": "unknown"' "$OUT"

section "4. workctl close with cleanup"
OUT=$($WORKCTL close "$WORKSPACE" --yes --quiet 2>&1)
if [[ -z "$OUT" ]]; then
  pass "close --yes succeeds"
else
  fail "close --yes succeeds (output: $OUT)"
fi

if ! tmux has-session -t "$WORKSPACE" 2>/dev/null; then
  pass "close kills tmux session"
else
  fail "close kills tmux session"
fi

if [[ ! -d "$FRONTEND_TREE" && ! -f "$FRONTEND_TREE/.git" ]]; then
  pass "close removes frontend worktree"
else
  fail "close removes frontend worktree"
fi

if [[ ! -d "$BACKEND_TREE" && ! -f "$BACKEND_TREE/.git" ]]; then
  pass "close removes backend worktree"
else
  fail "close removes backend worktree"
fi

if grep -q '"archived": true' "$STATE_DIR/workspaces/${WORKSPACE}.json"; then
  pass "close archives workspace state"
else
  fail "close archives workspace state"
fi

section "Summary"
TOTAL=$((PASS + FAIL + SKIP))
echo "Passed: $PASS / $TOTAL"
echo "Failed: $FAIL"
echo "Skipped: $SKIP"

if [[ "$FAIL" -gt 0 ]]; then exit 1; fi
echo "All Phase 3 tests passed."
