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
   `CHANGELOG.md` is excluded from pre-commit (release-please owns its format).
3. Review the Release PR. Merge when ready to ship.
4. Merging the Release PR creates the `vX.Y.Z` tag and GitHub Release.
5. The tag triggers [Release workflow](.github/workflows/release.yml), which
   runs checks and publishes `@aguil/work` to npm with provenance.

### Pre-1.0 semver

While the version is below `1.0.0`, `feat` commits bump the **patch** version
(`0.1.0` → `0.1.1`). Breaking changes (`feat!:` or `BREAKING CHANGE:` footer)
bump the **minor** version (`0.1.0` → `0.2.0`).

### Bootstrap (one time)

`@aguil/work` does not exist on npm until a maintainer publishes it once.
Trusted publishing is configured **per package** on npmjs.com, so the registry
must have the package name before you can attach a trusted publisher. CI cannot
publish the first version via OIDC alone.

**Order:**

1. **Merge** the npm publish setup to `main`.
2. **Manual first publish** from a maintainer machine (`@aguil` publish access):
   ```bash
   npm login   # scope: @aguil
   npm ci
   npm run build:publish
   npm publish --access public
   ```
   This creates `@aguil/work@0.1.0` on the registry.
3. **Trusted publisher** — on npm **`@aguil/work`** → Package settings →
   **Trusted publishers**, add **GitHub Actions**: repository **`aguil/work`**,
   workflow **`release.yml`** (filename only; case-sensitive).
4. **Git tag for release-please** — push **`v0.1.0`** on GitHub for the commit
   that matches the published version. The manifest
   (`.release-please-manifest.json`) already tracks `0.1.0`. Without this tag,
   release-please may open a Release PR that repackages the full git history.
   If [release.yml](.github/workflows/release.yml) runs on that tag, it skips
   publish when the version is already on npm.
5. **From then on** — merge release-please Release PRs; **`vX.Y.Z`** tags trigger
   [release.yml](.github/workflows/release.yml) which publishes via OIDC (no
   `NPM_TOKEN`).

Local `npm publish` after the bootstrap still uses `npm login` or a granular token.

Do **not** hand-edit `package.json` version or release sections of `CHANGELOG.md`
for routine releases; use the Release PR instead.

## Reporting issues

Use [GitHub Issues](https://github.com/aguil/work/issues). Include tmux version,
Node version, and steps to reproduce when reporting bugs.
