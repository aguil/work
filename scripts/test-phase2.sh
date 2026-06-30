#!/usr/bin/env bash
# Phase 2 automated tests: tree association and VCS metadata.
#
# Safety: uses isolated XDG dirs and only creates/destroys its own tmux sessions.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK_DIR="${WORK_DIR:-$ROOT}"
WORK="node $WORK_DIR/dist/work.mjs"

SESSION_PREFIX="work-autotest-trees"
SESSION="${SESSION_PREFIX}-$$"

TEST_ROOT="$(mktemp -d "/tmp/work-test-trees-XXXXXX")"
export XDG_CONFIG_HOME="$TEST_ROOT/config"
export XDG_STATE_HOME="$TEST_ROOT/state"
export XDG_RUNTIME_DIR="$TEST_ROOT/runtime"
mkdir -p "$XDG_CONFIG_HOME" "$XDG_STATE_HOME" "$XDG_RUNTIME_DIR"
chmod 700 "$XDG_RUNTIME_DIR"

STATE_DIR="$XDG_STATE_HOME/work"
REPO_ROOT="$TEST_ROOT/repos/demo"
WORKTREE_ROOT="$TEST_ROOT/worktrees/demo-feature"

PASS=0
FAIL=0
SKIP=0

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

section() { echo; echo "== $1 =="; }

DISCOVER_SESSION="${SESSION_PREFIX}-discover-$$"
CHECKOUT_BASE="$TEST_ROOT/projects/workspace"
PANE_REPO="$TEST_ROOT/pane-repo"
BASE_REPO="$CHECKOUT_BASE/from-base"

cleanup() {
  tmux kill-session -t "$SESSION" 2>/dev/null || true
  tmux kill-session -t "$DISCOVER_SESSION" 2>/dev/null || true
  rm -rf "$TEST_ROOT"
}
trap cleanup EXIT

require_tmux() {
  command -v tmux >/dev/null 2>&1 || { echo "tmux is required"; exit 1; }
}

require_git() {
  command -v git >/dev/null 2>&1 || { echo "git is required"; exit 1; }
}

echo "Test isolation:"
echo "  XDG_STATE_HOME=$XDG_STATE_HOME"
echo "  Test session: $SESSION"

section "1. Build & tree command smoke"
cd "$WORK_DIR"
npm run build >/dev/null

OUT=$($WORK --help 2>&1)
assert_contains "help lists add-tree" "add-tree" "$OUT"
assert_contains "help lists remove-tree" "remove-tree" "$OUT"
assert_contains "help lists trees" "trees" "$OUT"

section "2. Git tree association"
require_tmux
require_git

mkdir -p "$REPO_ROOT"
git -C "$REPO_ROOT" init -b main >/dev/null
git -C "$REPO_ROOT" config user.email "test@example.com"
git -C "$REPO_ROOT" config user.name "Test"
echo "demo" >"$REPO_ROOT/README.md"
git -C "$REPO_ROOT" add README.md
git -C "$REPO_ROOT" commit -m "init" >/dev/null

tmux kill-session -t "$SESSION" 2>/dev/null || true
tmux new-session -d -s "$SESSION"
$WORK track "$SESSION" --quiet

OUT=$($WORK add-tree "$REPO_ROOT" --session "$SESSION" 2>&1)
assert_contains "add-tree associates git repo" "[git]" "$OUT"

OUT=$($WORK trees --session "$SESSION" --json 2>&1)
assert_contains "trees --json reports git type" '"vcsType": "git"' "$OUT"
assert_contains "trees --json reports branch main" '"branch": "main"' "$OUT"

echo "dirty" >>"$REPO_ROOT/README.md"
OUT=$($WORK trees --session "$SESSION" --json 2>&1)
assert_contains "trees --json reports dirty state" '"dirty": true' "$OUT"

OUT=$($WORK add-tree "$REPO_ROOT" --session "$SESSION" 2>&1 || true)
assert_contains "add-tree rejects duplicate" "already associated" "$OUT"

section "3. Git worktree creation"
mkdir -p "$(dirname "$WORKTREE_ROOT")"
OUT=$(
  $WORK add-tree --new-worktree demo-feature "$REPO_ROOT" \
    --dest "$WORKTREE_ROOT" --session "$SESSION" --quiet 2>&1
)
if [[ -d "$WORKTREE_ROOT/.git" || -f "$WORKTREE_ROOT/.git" ]]; then
  pass "new-worktree creates checkout"
else
  fail "new-worktree creates checkout"
fi

OUT=$($WORK trees --session "$SESSION" --json 2>&1)
assert_contains "trees lists created worktree" "$WORKTREE_ROOT" "$OUT"

if grep -q '"createdByWork": true' "$STATE_DIR/workspaces/${SESSION}.json"; then
  pass "worktree marked createdByWork"
else
  fail "worktree marked createdByWork"
fi

section "4. remove-tree"
echo "wip" >>"$WORKTREE_ROOT/README.md"
git -C "$WORKTREE_ROOT" commit -am "wip feature commit" >/dev/null

if $WORK remove-tree "$WORKTREE_ROOT" --session "$SESSION" >/dev/null 2>&1; then
  fail "remove-tree blocks unmerged worktree without --force"
else
  pass "remove-tree blocks unmerged worktree without --force"
fi

OUT=$($WORK remove-tree "$WORKTREE_ROOT" --session "$SESSION" --force 2>&1)
assert_contains "remove-tree --force removes worktree checkout" "checkout removed" "$OUT"

if [[ ! -e "$WORKTREE_ROOT" ]]; then
  pass "remove-tree deletes git worktree from disk"
else
  fail "remove-tree deletes git worktree from disk"
fi

OUT=$($WORK remove-tree "$REPO_ROOT" --session "$SESSION" 2>&1)
assert_contains "remove-tree succeeds for primary repo" "removed tree" "$OUT"

OUT=$($WORK trees --session "$SESSION" 2>&1)
if [[ "$OUT" != *"$REPO_ROOT"* ]]; then
  pass "removed tree no longer listed"
else
  fail "removed tree no longer listed"
fi

if [[ -d "$REPO_ROOT" ]]; then
  pass "remove-tree leaves checkout on disk"
else
  fail "remove-tree leaves checkout on disk"
fi

section "5. Plain directory"
PLAIN_DIR="$TEST_ROOT/plain"
mkdir -p "$PLAIN_DIR"
OUT=$($WORK add-tree "$PLAIN_DIR" --session "$SESSION" 2>&1)
assert_contains "add-tree accepts plain directory" "[plain]" "$OUT"

section "6. Track discovers pane cwd and checkout-base trees"
require_git

mkdir -p "$PANE_REPO" "$CHECKOUT_BASE"
git -C "$PANE_REPO" init -b main >/dev/null
git -C "$PANE_REPO" config user.email "test@example.com"
git -C "$PANE_REPO" config user.name "Test"
echo "pane" >"$PANE_REPO/README.md"
git -C "$PANE_REPO" add README.md
git -C "$PANE_REPO" commit -m "init" >/dev/null

mkdir -p "$BASE_REPO"
git -C "$BASE_REPO" init -b main >/dev/null
git -C "$BASE_REPO" config user.email "test@example.com"
git -C "$BASE_REPO" config user.name "Test"
echo "base" >"$BASE_REPO/README.md"
git -C "$BASE_REPO" add README.md
git -C "$BASE_REPO" commit -m "init" >/dev/null

tmux kill-session -t "$DISCOVER_SESSION" 2>/dev/null || true
tmux new-session -d -s "$DISCOVER_SESSION" -c "$PANE_REPO" "sleep 999"
sleep 0.2

$WORK config set checkout-base "$CHECKOUT_BASE" >/dev/null
OUT=$($WORK track "$DISCOVER_SESSION" 2>&1)
assert_contains "track reports tracking session" "Tracking session" "$OUT"
assert_contains "track discovers checkout-base tree" "from-base" "$OUT"

OUT=$($WORK trees --session "$DISCOVER_SESSION" --json 2>&1)
assert_contains "trees include pane cwd checkout" "$PANE_REPO" "$OUT"
assert_contains "trees include checkout-base child" "$BASE_REPO" "$OUT"

section "Summary"
TOTAL=$((PASS + FAIL + SKIP))
echo "Passed: $PASS / $TOTAL"
echo "Failed: $FAIL"
echo "Skipped: $SKIP"

if [[ "$FAIL" -gt 0 ]]; then exit 1; fi
echo "All Phase 2 tests passed."
