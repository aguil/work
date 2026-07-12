# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Entries from the next release onward are updated by
[release-please](https://github.com/googleapis/release-please) when the release
PR merges. See [CONTRIBUTING.md](./CONTRIBUTING.md#releasing).

## [0.1.0] - 2026-07-12

### Added

- Initial public npm release as `@aguil/work`.
- `work` and `workd` CLIs for tmux session workspace tracking.
- Agent detection by process name, pane labels, and optional [herdr](https://herdr.dev) backend.
- Sidebar TUI (`work sidebar`) for agents and git/jj trees.
- Tier 1 agent hooks for Cursor and Claude Code (`work hooks install`).
- Git worktree and jj workspace management (`add-tree`, `remove-tree`, `new`).
- Configurable actions (`~/.config/work/actions/*.toml`) with trust store.
- XDG-based config and state under `~/.config/work` and `~/.local/state/work`.

[0.1.0]: https://github.com/aguil/work/releases/tag/v0.1.0
