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

pane_status() {
  $WORK agents --json 2>/dev/null | node -e '
    const agents = JSON.parse(require("fs").readFileSync(0, "utf-8"));
    const agent = agents.find((a) => a.paneId === process.argv[1]);
    console.log(agent ? agent.status : "missing");
  ' "$1"
}

pane_field() {
  $WORK agents --json 2>/dev/null | node -e '
    const agents = JSON.parse(require("fs").readFileSync(0, "utf-8"));
    const agent = agents.find((a) => a.paneId === process.argv[1]);
    console.log(agent ? agent[process.argv[2]] : "missing");
  ' "$1" "$2"
}

# Fires an installed-style hook script from a pane, as the CLI would.
fire_hook() {
  local target="$1" pane="$2" json="$3"
  printf '%s' "$json" \
    | TMUX="$(tmux display-message -p '#{socket_path},0,0')" \
      TMUX_PANE="$pane" WORK_BIN="node $WORK_DIR/dist/work.mjs" \
      bash "$WORK_DIR/dist/hooks/$target/work-event.sh"
}

# The hook scripts background `work`, so wait for the record to appear.
wait_pane_field() {
  local pane="$1" field="$2" expected="$3" value
  for _ in $(seq 1 50); do
    value=$(pane_field "$pane" "$field")
    [[ "$value" == "$expected" ]] && break
    sleep 0.1
  done
  echo "$value"
}

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

section "9. Hook script attributes events to TMUX_PANE, not the focused pane"
FOCUS_WINDOW=$(tmux new-window -d -t "$SESSION" -P -F '#{window_id}' \
  'bash -c "exec -a claude sleep 300"')
FOCUSED_PANE=$(tmux list-panes -t "$FOCUS_WINDOW" -F '#{pane_id}')
UNFOCUSED_PANE=$(tmux split-window -t "$FOCUS_WINDOW" -h -P -F '#{pane_id}' \
  'bash -c "exec -a claude sleep 300"')
sleep 0.3
$WORK scan --pane "$FOCUSED_PANE" --quiet
$WORK scan --pane "$UNFOCUSED_PANE" --quiet
for pane in "$FOCUSED_PANE" "$UNFOCUSED_PANE"; do
  printf '%s' '{"hook_event_name":"SessionStart","session_id":"focus-'"$pane"'","cwd":"/tmp"}' \
    | $WORK agent hook-event --pane "$pane" --quiet
done
tmux select-window -t "$FOCUS_WINDOW"
tmux select-pane -t "$FOCUSED_PANE"
assert_eq "focused pane has focus before the event" "$FOCUSED_PANE" \
  "$(tmux display-message -p -t "$SESSION" '#{pane_id}')"

HOOK_JSON='{"hook_event_name":"PreToolUse","session_id":"focus-'"$UNFOCUSED_PANE"'","tool_name":"Read"}'
printf '%s' "$HOOK_JSON" \
  | TMUX="$(tmux display-message -p '#{socket_path},0,0')" \
    TMUX_PANE="$UNFOCUSED_PANE" WORK_BIN="node $WORK_DIR/dist/work.mjs" \
    bash "$WORK_DIR/dist/hooks/claude/work-event.sh"
sleep 0.5
assert_eq "unfocused pane receives the event" "working" "$(pane_status "$UNFOCUSED_PANE")"
assert_eq "focused pane keeps its status" "idle" "$(pane_status "$FOCUSED_PANE")"

section "10. hooks install claude registers the absolute script path"
INSTALL_HOME="$TEST_ROOT/home"
mkdir -p "$INSTALL_HOME/.claude"
CLAUDE_SETTINGS="$INSTALL_HOME/.claude/settings.json"
INSTALLED_SCRIPT="$INSTALL_HOME/.claude/hooks/work-event.sh"
# Lists each event's command handlers, one "event command" per line.
registered_commands() {
  node -e '
    const { hooks } = JSON.parse(require("fs").readFileSync(process.argv[1], "utf-8"));
    for (const [event, groups] of Object.entries(hooks)) {
      for (const group of groups) {
        for (const handler of group.hooks) console.log(`${event} ${handler.command}`);
      }
    }
  ' "$CLAUDE_SETTINGS"
}

HOME="$INSTALL_HOME" $WORK hooks install claude >/dev/null 2>&1
OUT=$(registered_commands)
assert_contains "PreToolUse registers absolute path" "PreToolUse $INSTALLED_SCRIPT" "$OUT"
assert_eq "every event registers the absolute path" "$(wc -l <<< "$OUT")" \
  "$(grep -c " $INSTALLED_SCRIPT\$" <<< "$OUT")"
if [[ -x "$INSTALLED_SCRIPT" ]]; then pass "registered path is the installed script"
else fail "registered path is the installed script"; fi

section "11. Re-install replaces a relative registration"
cat > "$CLAUDE_SETTINGS" <<'JSON'
{
  "model": "keep-me",
  "hooks": {
    "PreToolUse": [
      { "hooks": [{ "type": "command", "command": "./hooks/work-event.sh", "async": true }] },
      { "matcher": "Bash", "hooks": [
        { "type": "command", "command": "./hooks/work-event.sh" },
        { "type": "command", "command": "/usr/local/bin/other-hook" }
      ] }
    ],
    "Stop": [{ "hooks": [{ "type": "command", "command": "./hooks/work-event.sh", "async": true }] }]
  }
}
JSON
HOME="$INSTALL_HOME" $WORK hooks install claude >/dev/null 2>&1
OUT=$(registered_commands)
if [[ "$OUT" == *"./hooks/work-event.sh"* ]]; then fail "relative registration removed"
else pass "relative registration removed"; fi
assert_eq "PreToolUse has one absolute registration" "1" \
  "$(grep -c "^PreToolUse $INSTALLED_SCRIPT\$" <<< "$OUT")"
assert_eq "Stop has one absolute registration" "1" \
  "$(grep -c "^Stop $INSTALLED_SCRIPT\$" <<< "$OUT")"
assert_contains "other hook in the group survives" \
  "PreToolUse /usr/local/bin/other-hook" "$OUT"
assert_contains "other settings survive" '"model": "keep-me"' "$(cat "$CLAUDE_SETTINGS")"

BEFORE=$(cat "$CLAUDE_SETTINGS")
HOME="$INSTALL_HOME" $WORK hooks install claude >/dev/null 2>&1
assert_eq "second install changes nothing" "$BEFORE" "$(cat "$CLAUDE_SETTINGS")"

section "12. Registered command runs from another directory when HOME has a space"
SPACED_HOME="$TEST_ROOT/home with space"
mkdir -p "$SPACED_HOME/.claude"
HOME="$SPACED_HOME" $WORK hooks install claude >/dev/null 2>&1
CLAUDE_SETTINGS="$SPACED_HOME/.claude/settings.json"
RAN_MARKER="$TEST_ROOT/registered-command-ran"
printf '#!/usr/bin/env bash\ntouch "%s"\n' "$RAN_MARKER" > "$SPACED_HOME/.claude/hooks/work-event.sh"
REGISTERED=$(registered_commands | sed -n 's/^PreToolUse //p')
(cd / && bash -c "$REGISTERED") >/dev/null 2>&1
if [[ -e "$RAN_MARKER" ]]; then pass "registered command runs through a shell"
else fail "registered command runs through a shell"; fi

section "13. A hook-created record carries the CLI that fired it"
# These panes run plain sleep, so detection cannot be the source of the CLI.
CLAUDE_PANE=$(tmux split-window -t "$FOCUS_WINDOW" -P -F '#{pane_id}' 'sleep 300')
fire_hook claude "$CLAUDE_PANE" '{"hook_event_name":"PreToolUse","session_id":"cli-claude","tool_name":"Read"}'
assert_eq "Claude Code hook creates a claude record" "claude" \
  "$(wait_pane_field "$CLAUDE_PANE" cli claude)"
assert_eq "pane option carries the CLI" "claude" \
  "$(tmux display-message -p -t "$CLAUDE_PANE" '#{@work-agent-cli}')"
assert_contains "record gets Claude Code's label" "claude" "$(pane_field "$CLAUDE_PANE" label)"

CURSOR_PANE=$(tmux split-window -t "$FOCUS_WINDOW" -P -F '#{pane_id}' 'sleep 300')
fire_hook cursor "$CURSOR_PANE" '{"hook_event_name":"preToolUse","conversation_id":"cli-cursor","tool_name":"Read"}'
assert_eq "Cursor hook keeps the name detection records" "agent" \
  "$(wait_pane_field "$CURSOR_PANE" cli agent)"

# Only claude.toml matches this string, so this shows which rules apply.
MANIFEST_PANE=$(tmux new-window -d -t "$SESSION" -P -F '#{pane_id}' \
  'printf "esc to interrupt\n"; sleep 300')
sleep 0.3
fire_hook claude "$MANIFEST_PANE" '{"hook_event_name":"Stop","session_id":"cli-manifest"}'
assert_eq "hook-created record is claude" "claude" \
  "$(wait_pane_field "$MANIFEST_PANE" cli claude)"
OUT=$($WORK agent observe "$MANIFEST_PANE" --json 2>&1)
assert_contains "hook-created record uses claude.toml" '"status": "working"' "$OUT"

section "14. A hook corrects an existing cli: agent record"
STALE_PANE=$(tmux split-window -t "$FOCUS_WINDOW" -P -F '#{pane_id}' 'sleep 300')
printf '%s' '{"hook_event_name":"PreToolUse","session_id":"cli-stale","tool_name":"Read"}' \
  | $WORK agent hook-event --pane "$STALE_PANE" --quiet
assert_eq "a hook reporting no CLI writes agent" "agent" "$(pane_field "$STALE_PANE" cli)"
STALE_LABEL=$(pane_field "$STALE_PANE" label)

fire_hook claude "$STALE_PANE" '{"hook_event_name":"Stop","session_id":"cli-stale"}'
assert_eq "Claude Code hook corrects the record" "claude" \
  "$(wait_pane_field "$STALE_PANE" cli claude)"
assert_eq "pane option follows the correction" "claude" \
  "$(tmux display-message -p -t "$STALE_PANE" '#{@work-agent-cli}')"
assert_eq "correction keeps the label" "$STALE_LABEL" "$(pane_field "$STALE_PANE" label)"

section "15. Notification installs once, with no matcher, and reaches the pane"
NOTIFY_HOME="$TEST_ROOT/notify-home"
mkdir -p "$NOTIFY_HOME/.claude"
HOME="$NOTIFY_HOME" $WORK hooks install claude >/dev/null 2>&1
HOME="$NOTIFY_HOME" $WORK hooks install claude >/dev/null 2>&1
OUT=$(node -e '
  const { hooks } = JSON.parse(require("fs").readFileSync(process.argv[1], "utf-8"));
  const groups = hooks.Notification ?? [];
  console.log(`${groups.length} ${groups[0]?.hooks.length} ${"matcher" in (groups[0] ?? {})}`);
' "$NOTIFY_HOME/.claude/settings.json")
assert_eq "one Notification registration with no matcher" "1 1 false" "$OUT"

NOTIFY_PANE=$(tmux new-window -d -t "$SESSION" -P -F '#{pane_id}' 'sleep 300')
fire_hook claude "$NOTIFY_PANE" '{"hook_event_name":"Stop","session_id":"notify"}'
assert_eq "agent is idle before the dialog" "idle" "$(wait_pane_field "$NOTIFY_PANE" status idle)"
fire_hook claude "$NOTIFY_PANE" '{"hook_event_name":"Notification","session_id":"notify","notification_type":"permission_prompt","message":"Claude needs your permission to use Bash"}'
assert_eq "permission_prompt blocks the pane it fired from" "blocked" \
  "$(wait_pane_field "$NOTIFY_PANE" status blocked)"
fire_hook claude "$NOTIFY_PANE" '{"hook_event_name":"Notification","session_id":"notify","notification_type":"idle_prompt","message":"Claude is waiting for your input"}'
assert_eq "idle_prompt reads idle on the pane it fired from" "idle" \
  "$(wait_pane_field "$NOTIFY_PANE" status idle)"

section "Hook event timestamps (#51)"
# A fake `work` records the argv each script passes, so these read the stamp
# itself instead of inferring it from a status.
STAMP_DIR="$TEST_ROOT/stamp"
mkdir -p "$STAMP_DIR"
cat >"$STAMP_DIR/fake-work" <<'FAKE'
#!/usr/bin/env bash
cat >/dev/null
printf '%s\n' "$@" >"$STAMP_OUT"
FAKE
chmod +x "$STAMP_DIR/fake-work"

# Prints the value of --ts from one run of a hook script.
stamp_from() {
  local script="$1" out="$STAMP_DIR/args" i
  rm -f "$out"
  printf '{}' | STAMP_OUT="$out" WORK_BIN="$STAMP_DIR/fake-work" TMUX_PANE=%0 bash "$script"
  for ((i = 0; i < 50; i++)); do [[ -s "$out" ]] && break; sleep 0.05; done
  grep -A1 '^--ts$' "$out" | tail -1
}

for target in claude cursor; do
  SCRIPT="$WORK_DIR/dist/hooks/$target/work-event.sh"
  NOW_US=$(($(date +%s) * 1000000))
  TS=$(stamp_from "$SCRIPT")
  [[ "$TS" =~ ^[0-9]{16}$ ]] && pass "$target stamps sixteen digits" \
    || fail "$target stamps sixteen digits (got '$TS')"
  if (( TS - NOW_US >= 0 && TS - NOW_US < 10000000 )) && [[ "$TS" != *000000 ]]; then
    pass "$target stamps microseconds from EPOCHREALTIME"
  else
    fail "$target stamps microseconds from EPOCHREALTIME (got '$TS', now '$NOW_US')"
  fi

  NO_EPOCH="$STAMP_DIR/$target-no-epoch.sh"
  sed '1a unset EPOCHREALTIME' "$SCRIPT" >"$NO_EPOCH"
  NOW_US=$(($(date +%s) * 1000000))
  TS=$(stamp_from "$NO_EPOCH")
  if [[ "$TS" =~ ^[0-9]{10}000000$ ]] && (( TS - NOW_US >= 0 && TS - NOW_US < 10000000 )); then
    pass "$target falls back to date +%s in the same unit"
  else
    fail "$target falls back to date +%s in the same unit (got '$TS', now '$NOW_US')"
  fi

  grep -v '^[[:space:]]*#' "$SCRIPT" | grep -q '%N' \
    && fail "$target never uses %N" || pass "$target never uses %N"
done

section "A late event after sessionEnd (#51)"
# Passes --ts directly so the order is fixed, from a real pane: an event with no
# pane never reaches the agent lookup, so it could not show this.
fire_at() {
  local pane="$1" ts="$2" json="$3"
  printf '%s' "$json" | TMUX="$(tmux display-message -p '#{socket_path},0,0')" \
    $WORK agent hook-event --quiet --cli claude --pane "$pane" --ts "$ts"
}

ORDER_PANE=$(tmux new-window -d -t "$SESSION" -P -F '#{pane_id}' 'sleep 300')
fire_at "$ORDER_PANE" 2000 '{"hook_event_name":"PreToolUse","session_id":"order"}'
assert_eq "agent works before its session ends" "working" "$(pane_status "$ORDER_PANE")"
fire_at "$ORDER_PANE" 3000 '{"hook_event_name":"SessionEnd","session_id":"order"}'
assert_eq "sessionEnd detaches the agent" "missing" "$(pane_status "$ORDER_PANE")"
BEFORE=$($WORK agents --json | node -e 'console.log(JSON.parse(require("fs").readFileSync(0,"utf-8")).length)')
fire_at "$ORDER_PANE" 1000 '{"hook_event_name":"PreToolUse","session_id":"order"}'
assert_eq "an older event does not bring the pane back" "missing" "$(pane_status "$ORDER_PANE")"
AFTER=$($WORK agents --json | node -e 'console.log(JSON.parse(require("fs").readFileSync(0,"utf-8")).length)')
assert_eq "an older event creates no record" "$BEFORE" "$AFTER"
fire_at "$ORDER_PANE" 4000 '{"hook_event_name":"PreToolUse","session_id":"order-2"}'
assert_eq "a newer event in that pane starts a new agent" "working" "$(pane_status "$ORDER_PANE")"

section "Every hook event is recorded (#52)"
QUIET_PANE=$(tmux new-window -d -t "$SESSION" -P -F '#{pane_id}' 'sleep 300')
fire_hook claude "$QUIET_PANE" '{"hook_event_name":"Stop","session_id":"quiet"}'
assert_eq "agent is idle before PostToolUse" "idle" "$(wait_pane_field "$QUIET_PANE" status idle)"
FIRST_EVENT_AT=$(pane_field "$QUIET_PANE" lastHookEventAt)
[[ "$FIRST_EVENT_AT" == 20* ]] && pass "a status event records lastHookEventAt" \
  || fail "a status event records lastHookEventAt (got '$FIRST_EVENT_AT')"
fire_hook claude "$QUIET_PANE" '{"hook_event_name":"PostToolUse","tool_name":"Read"}'
for _ in {1..40}; do
  [[ "$(pane_field "$QUIET_PANE" lastHookEventAt)" != "$FIRST_EVENT_AT" ]] && break
  sleep 0.05
done
[[ "$(pane_field "$QUIET_PANE" lastHookEventAt)" != "$FIRST_EVENT_AT" ]] \
  && pass "PostToolUse moves lastHookEventAt on the pane it fired from" \
  || fail "PostToolUse moves lastHookEventAt on the pane it fired from"
assert_eq "PostToolUse leaves the status" "idle" "$(pane_status "$QUIET_PANE")"

section "Summary"
echo "Passed: $PASS"
echo "Failed: $FAIL"
if [[ "$FAIL" -eq 0 ]]; then
  echo "All Phase 7 tests passed."
  exit 0
fi
exit 1
