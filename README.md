# workctl

Agent workspace manager for tmux. Tracks sessions, detects agent CLIs, and
provides a sidebar dashboard via the companion [tmux-tmuxr](../tmux-tmuxr)
TPM plugin.

## Requirements

- Node.js 20+ (see `.mise.toml`)
- tmux 3.x

## Development

```bash
mise install
npm install
npm run build
npm test          # Phase 1 integration tests (requires tmux)
npm run typecheck
```

Binaries are written to `dist/workctl.mjs` and `dist/workctld.mjs`.

## Configuration

State and config follow XDG Base Directory defaults:

- Config: `~/.config/workctl/config.json`
- State: `~/.local/state/workctl/workspaces/`
- Runtime socket: `$XDG_RUNTIME_DIR/workctl/workctl.sock`

## tmux integration

Load via [tmux-tmuxr](../tmux-tmuxr) (chezmoi `~/.tmux.conf` sources the plugin
from your project workspace checkout). Keybindings:

- `prefix + Shift+S` — track current session and scan for agents
- `prefix + Shift+W` — toggle sidebar pane

## Related

- Meta-project plans and handoff: `~/dev/projects/tmuxr/`
- Plugin repo: `~/dev/repos/github.com/aguil/tmux-tmuxr`
