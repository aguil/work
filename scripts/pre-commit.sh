#!/usr/bin/env bash
# Run pre-commit in a jj workspace (no .git) or a plain/colocated git checkout.
set -euo pipefail

if [ -e .git ]; then
  exec pre-commit run --all-files "$@"
fi

if ! command -v jj >/dev/null 2>&1; then
  echo "pre-commit: no .git and jj not found" >&2
  exit 1
fi

GIT_DIR="$(jj git root)"
GIT_WORK_TREE="$(jj workspace root)"
export GIT_DIR GIT_WORK_TREE
exec pre-commit run --all-files "$@"
