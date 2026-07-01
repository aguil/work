#!/usr/bin/env bash
# Claude Code hook adapter for work Tier 1 agent status.
# Installed to ~/.claude/hooks/work-event.sh by: work hooks install claude

set -euo pipefail

WORK_BIN="${WORK_BIN:-__WORK_BIN__}"
read -r -a WORK_CMD <<< "$WORK_BIN"
if [[ ${#WORK_CMD[@]} -eq 1 ]] \
  && ! command -v "${WORK_CMD[0]}" >/dev/null 2>&1 \
  && [[ "${WORK_CMD[0]}" != /* ]] \
  && [[ ! -x "${WORK_CMD[0]}" ]]; then
  read -r -a WORK_CMD <<< "$(command -v work 2>/dev/null || echo work)"
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

printf '%s' "$input" | "${WORK_CMD[@]}" "${args[@]}" >/dev/null 2>&1 &
exit 0
