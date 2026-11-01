#!/usr/bin/env bash
# Runs a command, by default `npm run check`, on a private tmux server with
# isolated XDG dirs. The server takes no user config: ~/.tmux.conf would load
# the tmux-tmuxr plugin, whose workd is detached and outlives the server.
set -uo pipefail

cd "$(dirname "$0")/.."

# tmux fails with "Filename too long" on a deep socket path.
ISOLATED=$(mktemp -d /tmp/wt-XXXXXX)
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
trap 'exit 130' INT
trap 'exit 143' TERM

tmux -f /dev/null new-session -d -s keepalive 'sleep 86400'

if [[ $# -eq 0 ]]; then
  set -- npm run check
fi
"$@"
