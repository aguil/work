# Contributing to work

Thank you for contributing. This document covers local setup, checks, and the
release process for [`@aguil/work`](https://www.npmjs.com/package/@aguil/work).

## Prerequisites

- [mise](https://mise.jdx.dev/) (toolchain versions from `.mise.toml`)
- tmux 3.x (required for integration tests)
- [Jujutsu](https://jj-vcs.github.io/jj/latest/) for version control in this repo

Optional but useful for full feature coverage:

- git and/or jj for VCS integration tests
- Cursor or Claude Code CLI for hook integration tests (phases 6–7)

## Setup

```bash
mise install
npm ci
npm run build
```

## Checks before opening a PR

```bash
npm run typecheck
npm run lint
npm run pre-commit   # markdown + biome via pre-commit framework
npm run test         # phases 1–7; requires tmux
```

`npm run check` runs typecheck, lint, build, and the full integration suite.

Unit tests only (no tmux):

```bash
npm run test:unit
```

## Version control

This repository uses **Jujutsu** colocated with git.

- Use `jj` for all mutations. Do not run `git commit`, `git rebase`, or other
  git write commands in this checkout.
- Commit messages use **Conventional Commits** (`type: subject`) with a body
  paragraph explaining why the change was made.

## Project layout

See [AGENTS.md](./AGENTS.md) for module-level orientation aimed at coding agents.

## npm publish layout

Published tarballs include only:

- `dist/work.mjs`, `dist/workd.mjs`
- `dist/manifests/`, `dist/hooks/`
- `LICENSE`, `README.md`

`npm pack` runs `prepack` → `build:publish` (production build, no sourcemaps).
Validate packaging before a release:

```bash
npm pack --dry-run
```

## Releasing

Releases are automated with
[release-please](https://github.com/googleapis/release-please).

### Day to day

1. Merge PRs to `main` with **Conventional Commit** titles (`feat:`, `fix:`,
   `perf:`, etc.). The commit subject becomes the changelog bullet; the body is
   not included.
2. release-please opens or updates a **Release PR** (`chore: release X.Y.Z`)
   that bumps `package.json`, `.release-please-manifest.json`, and `CHANGELOG.md`.
3. Review the Release PR. Merge when ready to ship.
4. Merging the Release PR creates the `vX.Y.Z` tag and GitHub Release.
5. The tag triggers [Release workflow](.github/workflows/release.yml), which
   runs checks and publishes `@aguil/work` to npm with provenance.

### Pre-1.0 semver

While the version is below `1.0.0`, `feat` commits bump the **patch** version
(`0.1.0` → `0.1.1`). Breaking changes (`feat!:` or `BREAKING CHANGE:` footer)
bump the **minor** version (`0.1.0` → `0.2.0`).

### Bootstrap (one time)

The manifest (`.release-please-manifest.json`) tracks the last released version
(`0.1.0`). Before the first automated release after setup, ensure tag **`v0.1.0`**
exists on GitHub for that commit. Otherwise release-please may open a Release PR
that repackages the full git history.

Do **not** hand-edit `package.json` version or release sections of `CHANGELOG.md`
for routine releases; use the Release PR instead.

First-time npm setup requires an `@aguil` org scope and `NPM_TOKEN` configured as
a repository secret, plus npm trusted publishing from GitHub Actions.

## Reporting issues

Use [GitHub Issues](https://github.com/aguil/work/issues). Include tmux version,
Node version, and steps to reproduce when reporting bugs.
