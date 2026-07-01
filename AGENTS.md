# workctl — agent instructions

TypeScript CLI for tmux-native agent workspace tracking. Bundled with esbuild;
no runtime dependencies beyond Node built-ins and `commander`.

## Repository layout

- `src/cli.ts` — CLI entry (`workctl`)
- `src/daemon/` — `workctld` server, state aggregator, IPC protocol
- `src/commands/` — commander subcommands
- `src/tmux/` — thin tmux CLI wrapper
- `src/config/` — XDG paths and JSON config store
- `src/workspace/` — per-workspace JSON state
- `src/scanner/` — agent detection by process name
- `src/sidebar/` — ANSI TUI client
- `scripts/test-phase1.sh` — integration test suite

## Development

```bash
mise install
npm install
npm run build
npm run typecheck
npm test    # requires tmux; uses isolated XDG dirs
```

Before committing: `npm run typecheck` and `npm run pre-commit` (works in jj
workspaces and git clones).

## Version control

This repo uses **Jujutsu** colocated with git (`jj git init --colocate`).

- Use `jj` for all mutations. Do **not** run `git commit`, `git rebase`, or
  other git write commands in this checkout.
- Dev workspace checkout: `~/dev/projects/tmuxr/workctl`
- Canonical store: `~/dev/repos/github.com/aguil/workctl`

## Conventions

- ESM, Node 20+, strict TypeScript
- Fast CLI startup matters — hooks invoke `workctl` on every pane event
- State files use atomic write-to-temp + rename
- Agent records keyed by `workspace + label`, not pane ID
