#!/usr/bin/env bash
# Remove leftover tmux sessions from work integration tests.
set -uo pipefail

SESSION_PREFIXES=(
  work-autotest
)

# Path-shaped session names from track/session safety tests.
EXTRA_PATTERNS=(
  '__/__/evil'
  '__/escape-test'
  '/tmp/absname'
  'test/__/evil'
  'test/__/traversal'
)

kill_session() {
  local name="$1"
  tmux kill-session -t "$name" 2>/dev/null || true
}

mapfile -t ALL_SESSIONS < <(tmux list-sessions -F '#{session_name}' 2>/dev/null || true)

for name in "${ALL_SESSIONS[@]}"; do
  for prefix in "${SESSION_PREFIXES[@]}"; do
    if [[ "$name" == "$prefix"* ]]; then
      kill_session "$name"
      continue 2
    fi
  done
  for exact in "${EXTRA_PATTERNS[@]}"; do
    if [[ "$name" == "$exact" ]]; then
      kill_session "$name"
      break
    fi
  done
done
