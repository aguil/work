#!/usr/bin/env bash
# Runs a command, by default `npm run check`, on a private tmux server with
# isolated XDG dirs. The server takes no user config: ~/.tmux.conf would load
# the tmux-tmuxr plugin, whose workd is detached and outlives the server.
set -uo pipefail

cd "$(dirname "$0")/.."

# tmux fails with "Filename too long" on a deep socket path.
# With no directory, tmux would fall back to the live server, and cleanup kills it.
ISOLATED=$(mktemp -d /tmp/wt-XXXXXX) || exit 1
mkdir -p "$ISOLATED/config" "$ISOLATED/state" "$ISOLATED/runtime"
chmod 700 "$ISOLATED/runtime"

export TMUX_TMPDIR="$ISOLATED"
export XDG_CONFIG_HOME="$ISOLATED/config"
export XDG_STATE_HOME="$ISOLATED/state"
export XDG_RUNTIME_DIR="$ISOLATED/runtime"
export WORK_BIN="node $PWD/dist/work.mjs"
unset TMUX TMUX_PANE

cleanup() {
  local pid
  pid=$(cat "$XDG_RUNTIME_DIR/work/workd.pid" 2>/dev/null) &&
    kill "$pid" 2>/dev/null
  tmux kill-server 2>/dev/null
  rm -rf -- "$ISOLATED"
}
trap cleanup EXIT

# Bash runs a trap only once the foreground command ends, so the command runs as
# a job, whose own process group lets a signal reach everything npm started.
child=""
stop() {
  [[ -n "$child" ]] && kill -- "-$child" 2>/dev/null
  exit "$1"
}
trap 'stop 130' INT
trap 'stop 143' TERM
trap 'stop 129' HUP

tmux -f /dev/null new-session -d -s keepalive 'sleep 86400'

if [[ $# -eq 0 ]]; then
  set -- npm run check
fi
set -m
"$@" &
child=$!
set +m
wait "$child"
