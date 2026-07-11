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
npm test              # Phases 1–7 integration tests (requires tmux)
scripts/test-phase5.sh
scripts/test-phase6.sh
scripts/test-phase7.sh
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

### Session shortcut keys (sidebar labels)

The sidebar prefixes each session with a single character (e.g. `2:tmuxr`) so
you can see which key switches to that session in tmux's session picker
(`prefix + s` by default). That label is **not** a tmux global option — tmux
documents the mechanism in [choose-tree(1)](https://man.openbsd.org/tmux.1#choose-tree)
(`-K key-format`, evaluated per list line), but the actual keys depend on your
binding.

**Stock tmux** (`choose-tree -s`, no custom `-K`) assigns keys by **0-based list
position** (`#{line}`), sorted by session id by default (`-O index`):

| List position | Key |
| ------------- | --- |
| 0–9           | `0`–`9` |
| 10–35         | `M-a`–`M-z` (Meta/Alt + letter) |

Many configs override `prefix + s` with a custom `-K` format (plain `a`–`z`,
skipping letters that conflict with tree-mode keys, etc.). `work` cannot parse
that expression; keep the alphabet in sync manually.

```bash
# Alphabet: one character per shortcut index (default: 0-9 then a-z)
work config set session-shortcut-keys '0123456789abcdegiopu'

# Index source: id ($N-1) or choose-order (list position in choose-tree -s)
work config set session-shortcut-index choose-order
```

Or set tmux globals alongside your `bind-key s` block (read once per `workd`
lifetime; `work config` is the fallback when unset):

```tmux
set-option -g @work-session-shortcut-keys "0123456789abcdegiopu"
set-option -g @work-session-shortcut-index choose-order
```

Use `choose-order` when session ids have gaps (`$1`, `$3`, `$5` …) or when your
`-K` mapping uses `#{line}` rather than session id. Use `id` when your `-K`
block maps `$N` (or equivalent) directly to the alphabet.

## Commands (summary)

| Area      | Commands                                                                   |
| --------- | -------------------------------------------------------------------------- |
| Workspace | `track`, `untrack`, `list`, `new`, `close`, `reconcile`                    |
| Agents    | `scan`, `agents`, `launch`, `agent relaunch`, `agent hook-event`, `status` |
| Hooks     | `hooks install cursor`, `hooks install claude`, `hooks print-env`          |
| Trees     | `add-tree`, `remove-tree`, `trees`, `window use-repo`                      |
| Actions   | `action list`, `action run`, `trust add/remove`                            |
| Config    | `config get/set/list`, `repos`                                             |

`add-tree --open` associates a checkout and opens a new tmux window for it.
`remove-tree` forgets work-created jj/git checkouts with safety prompts.

Agent hooks use a single-pane scan fast path (`scan --pane`) so large sessions
stay responsive.

### Agent hooks (Tier 1 status)

For accurate `working` / `blocked` / `idle` on interactive agents, install
user-level hooks that call `work agent hook-event`:

```bash
npm run build
node dist/work.mjs hooks install cursor   # Cursor CLI
node dist/work.mjs hooks install claude   # Claude Code
# optional: add to shell profile for tmux-launched agents
eval "$(node dist/work.mjs hooks print-env)"
```

Hooks write **explicit** status (overriding manifest/title heuristics until
`sessionEnd` / `SessionEnd`). Reload the agent after install.

- Cursor: [Cursor hooks](https://cursor.com/docs/hooks)
- Claude Code: [Claude Code hooks](https://code.claude.com/docs/en/hooks)

### herdr detection backend (Tier 2 status, optional)

Screen heuristics normally use the bundled TOML manifests in
`src/adapters/manifests/`. When a [herdr](https://herdr.dev) binary is
installed, `work` instead pipes each pane snapshot through
`herdr agent explain --file --agent <label> --json`, which evaluates herdr's
maintained (and remotely updated) detection manifests for ~18 agent CLIs.

- A herdr rule match wins; when herdr reports the screen should not drive a
  state update (e.g. a transcript viewer showing stale prompts), the
  observation is suppressed.
- When herdr matches nothing (or doesn't know the agent), `work` falls back
  to its bundled manifests, so behavior without herdr is unchanged.
- Transient herdr failures pause the backend for 30s and then retry, so a
  long-running `workd` recovers without a restart.
- Unchanged pane screens reuse the last herdr verdict within a long-lived
  process (keyed by pane id and content hash), so `workd` polls avoid
  spawning `herdr` on every tick when the screen is static.
- Agent pane detection (`scan`) also consults herdr for screen evidence and
  process-name matching when no bundled manifest exists, so agents like
  codex/opencode stay registered across calm titles and detach edges.

Observations also carry detection metadata, persisted on the agent record
and exposed via `work agents --json` and daemon snapshots for UIs:
`statusReason` (matched rule ID, e.g. `bash_permission_prompt`),
`visibleBlocker` (blocker chrome is on screen right now, not inferred from
scrollback), and `statusEvidence` (a one-line snippet of the matched region,
e.g. the pending approval prompt).

Configuration via environment (e.g. `tmux set-environment -g`):

```bash
WORK_HERDR_BIN=/path/to/herdr   # explicit binary (default: auto-detect on PATH)
WORK_HERDR_BIN=off              # disable the backend
```

## tmux integration

Load via [tmux-tmuxr](../tmux-tmuxr). Keybindings:

- `prefix + Shift+S` — track current session and scan for agents
- `prefix + Shift+W` — toggle sidebar for the session

## Related

- Meta-project plans and handoff: `~/dev/projects/tmuxr/`
- Plugin repo: `~/dev/repos/github.com/aguil/tmux-tmuxr`
