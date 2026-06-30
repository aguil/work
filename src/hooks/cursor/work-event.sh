#!/usr/bin/env bash
# Cursor hook adapter for work Tier 1 agent status.
# Installed to ~/.cursor/hooks/work-event.sh by: work hooks install cursor

set -euo pipefail

WORK_BIN="${WORK_BIN:-__WORK_BIN__}"
if ! command -v "$WORK_BIN" >/dev/null 2>&1 && [[ "$WORK_BIN" != /* ]]; then
  WORK_BIN="$(command -v work 2>/dev/null || echo work)"
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

printf '%s' "$input" | "$WORK_BIN" "${args[@]}" >/dev/null 2>&1 &
exit 0
