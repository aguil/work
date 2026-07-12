# work — agent instructions

TypeScript CLI for tmux-native agent workspace tracking. Bundled with esbuild;
runtime dependencies: Node built-ins, `commander`, and `smol-toml` (manifest loaders).

## Repository layout

- `src/cli.ts` — CLI entry (`work`)
- `src/daemon/` — `workd` server, state aggregator, IPC protocol
- `src/commands/` — commander subcommands
- `src/tmux/` — thin tmux CLI wrapper
- `src/config/` — XDG paths and JSON config store
- `src/workspace/` — per-workspace JSON state
- `src/scanner/` — agent detection by process name
- `src/sidebar/` — ANSI TUI client
- `src/vcs/` — git/jj detection, worktree/workspace creation, metadata
- `src/commands/trees.ts` — add-tree, remove-tree, trees
- `scripts/test-phase1.sh` — Phase 1 integration test suite
- `scripts/test-phase2.sh` — Phase 2 tree and VCS integration tests
- `scripts/test-phase3.sh` — Phase 3 workspace lifecycle tests
- `scripts/test-phase4.sh` — Phase 4 actions and repo picker tests
- `scripts/test-phase5.sh` — Phase 5 status adapter tests
- `scripts/test-phase6.sh` — Phase 6 Cursor hook Tier 1 tests
- `scripts/test-phase7.sh` — Phase 7 Claude Code hook Tier 1 tests
- `src/adapters/` — manifest loader, rule evaluation, hook events, Cursor/Claude adapters
- `src/adapters/herdr.ts` — optional herdr-backed Tier 2 detection (WORK_HERDR_BIN)

## Development

```bash
mise install
npm install
npm run build
npm run typecheck
npm test    # requires tmux; uses isolated XDG dirs
```

Before committing: `npm run typecheck`, `npm run lint`, and `npm run pre-commit`
(works in jj workspaces and git clones).

## Version control

This repo uses **Jujutsu** colocated with git (`jj git init --colocate`).

- Use `jj` for all mutations. Do **not** run `git commit`, `git rebase`, or
  other git write commands in this checkout.
- Dev workspace checkout: `~/dev/projects/tmuxr/work`
- Canonical store: `~/dev/repos/github.com/aguil/work`
- Commit descriptions use **Conventional Commits** (`type: subject`) and always
  include a body paragraph after a blank line explaining why the change was made.
  Set with `jj desc -m` before `jj new`.

## Conventions

- ESM, Node 20+, strict TypeScript
- Fast CLI startup matters — hooks invoke `work` on every pane event
- State files use atomic write-to-temp + rename
- Agent records keyed by `workspace + label`, not pane ID

## npm packaging

- Published as `@aguil/work` on npm; CLI binaries remain `work` and `workd`.
- Version lives in `package.json`; `build.mjs` injects it into bundles via
  `__WORK_VERSION__` (see `src/version.ts`).
- `npm pack` / publish use `prepack` → `build:publish` (production build, no
  sourcemaps). Dev builds use `npm run build` (with sourcemaps).
- Tarball `files` whitelist: `dist/work.mjs`, `dist/workd.mjs`, `dist/manifests/`,
  `dist/hooks/`, `LICENSE`, `README.md`. Validate with `npm pack --dry-run`.
- Release: [release-please](https://github.com/googleapis/release-please) opens
  Release PRs on `main`; merging creates `vX.Y.Z` + GitHub Release; tag triggers
  `.github/workflows/release.yml` for npm publish via OIDC trusted publishing
  (no `NPM_TOKEN` secret after bootstrap). First publish is manual (`npm login`);
  then attach trusted publisher on `@aguil/work` for workflow `release.yml`.
  Manifest: `.release-please-manifest.json`; config: `release-please-config.json`.
