# work

Agent workspace manager for tmux. Tracks sessions, detects agent CLIs, manages
git/jj checkouts, and provides a sidebar dashboard via the companion
[tmux-tmuxr](../tmux-tmuxr) TPM plugin.

## Requirements

- Node.js 20+ (see `.mise.toml`)
- tmux 3.x

## Development

```bash
mise install
npm install
npm run build
npm run typecheck
npm test              # Phase 1 integration tests
scripts/test-phase2.sh
scripts/test-phase3.sh
scripts/test-phase4.sh
```

Binaries are written to `dist/work.mjs` and `dist/workd.mjs`.

## Configuration

State and config follow XDG Base Directory defaults:

- Config: `~/.config/work/config.json`
- Actions: `~/.config/work/actions/*.toml`
- State: `~/.local/state/work/workspaces/`
- Runtime socket: `$XDG_RUNTIME_DIR/work/work.sock`

Common settings:

```bash
# Where work new / repos / new-window picker find repositories
work config set repo-scan-dir ~/dev/repos,~/dev/other

# Base directory for project checkouts (window use-repo, new-window picker)
work config set checkout-base ~/dev/projects/tmuxr

# Opt-in repo picker on prefix+c in tracked sessions
work config set prompt-repos-on-new-window true

# Opt-in: track every new tmux session automatically
work config set auto-track true
```

## Commands (summary)

| Area | Commands |
| ---- | -------- |
| Workspace | `track`, `untrack`, `list`, `new`, `close`, `reconcile` |
| Agents | `scan`, `agents`, `launch`, `agent relaunch`, `agent hook-event`, `status` |
| Hooks | `hooks install cursor`, `hooks print-env` |
| Trees | `add-tree`, `remove-tree`, `trees`, `window use-repo` |
| Actions | `action list`, `action run`, `trust add/remove` |
| Config | `config get/set/list`, `repos` |

`add-tree --open` associates a checkout and opens a new tmux window for it.
`remove-tree` forgets work-created jj/git checkouts with safety prompts.

Agent hooks use a single-pane scan fast path (`scan --pane`) so large sessions
stay responsive.

### Cursor hooks (Tier 1 status)

For accurate `working` / `blocked` / `idle` on interactive Cursor agents, install
user-level hooks that call `work agent hook-event`:

```bash
npm run build
node dist/work.mjs hooks install cursor
# optional: add to shell profile for tmux-launched agents
eval "$(node dist/work.mjs hooks print-env)"
```

Hooks write **explicit** status (overriding manifest/title heuristics until
`sessionEnd`). Reload Cursor after install. See [Cursor hooks](https://cursor.com/docs/hooks).

## tmux integration

Load via [tmux-tmuxr](../tmux-tmuxr). Keybindings:

- `prefix + Shift+S` — track current session and scan for agents
- `prefix + Shift+W` — toggle sidebar for the session

## Related

- Meta-project plans and handoff: `~/dev/projects/tmuxr/`
- Plugin repo: `~/dev/repos/github.com/aguil/tmux-tmuxr`
