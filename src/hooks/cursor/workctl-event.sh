#!/usr/bin/env bash
# Cursor hook adapter for workctl Tier 1 agent status.
# Installed to ~/.cursor/hooks/workctl-event.sh by: workctl hooks install cursor

set -euo pipefail

WORKCTL_BIN="${WORKCTL_BIN:-__WORKCTL_BIN__}"
if ! command -v "$WORKCTL_BIN" >/dev/null 2>&1 && [[ "$WORKCTL_BIN" != /* ]]; then
  WORKCTL_BIN="$(command -v workctl 2>/dev/null || echo workctl)"
fi

input=$(cat)

pane_id=""
if [[ -n "${TMUX:-}" ]]; then
  pane_id=$(tmux display-message -p '#{pane_id}' 2>/dev/null || true)
fi

args=(agent hook-event --quiet)
if [[ -n "$pane_id" ]]; then
  args+=(--pane "$pane_id")
fi

printf '%s' "$input" | "$WORKCTL_BIN" "${args[@]}" >/dev/null 2>&1 &
exit 0
