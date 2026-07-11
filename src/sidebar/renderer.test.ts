import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AgentView, SessionSnapshot } from "../daemon/protocol.js";
import { snapshotFingerprint } from "../daemon/protocol.js";
import {
  formatChooseKey,
  formatTmuxSessionKey,
  formatTmuxSessionKeyFromId,
} from "../tmux/client.js";
import { formatWindowLocation, repoDisplayName, sortAgents } from "./layout.js";
import { normalizeSessions } from "./normalize.js";
import { render } from "./renderer.js";
import { coloredJjChangeId, formatRevisionLabel } from "./revision.js";

function agent(
  partial: Partial<AgentView> & Pick<AgentView, "label">,
): AgentView {
  return {
    cli: "cursor",
    paneId: "%1",
    status: "idle",
    confidence: "none",
    detachedAt: null,
    lastSeen: "",
    sessionIndex: 0,
    sessionName: "proj",
    windowIndex: 0,
    windowName: "main",
    ...partial,
  };
}

function session(
  partial: Partial<SessionSnapshot> & Pick<SessionSnapshot, "name">,
): SessionSnapshot {
  return {
    id: "$1",
    index: 1,
    windowCount: 1,
    attached: false,
    tracked: true,
    workspaceName: partial.name,
    agents: [],
    trees: [],
    ...partial,
  };
}

describe("sidebar layout", () => {
  it("sorts blocked agents first", () => {
    const sorted = sortAgents([
      agent({ label: "idle-one", status: "idle" }),
      agent({ label: "blocked-one", status: "blocked" }),
      agent({ label: "working-one", status: "working" }),
    ]);
    assert.deepEqual(
      sorted.map((a) => a.label),
      ["blocked-one", "working-one", "idle-one"],
    );
  });

  it("formats window location with session and window index", () => {
    const loc = formatWindowLocation(
      agent({
        label: "x",
        sessionIndex: 7,
        sessionName: "my-project",
        windowIndex: 0,
        windowName: "agents",
      }),
    );
    assert.equal(loc, "6:my-project · 1:agents");
  });

  it("formats session index with tmux choose-session keys after 9", () => {
    assert.equal(formatTmuxSessionKey(9), "9");
    assert.equal(formatTmuxSessionKey(10), "a");
    assert.equal(formatTmuxSessionKey(11), "b");
    assert.equal(formatTmuxSessionKeyFromId(10), "9");
    assert.equal(formatTmuxSessionKeyFromId(11), "a");
    assert.equal(formatTmuxSessionKeyFromId(12), "b");
    const loc = formatWindowLocation(
      agent({
        label: "x",
        sessionIndex: 12,
        sessionName: "extra",
        windowIndex: 0,
        windowName: "main",
      }),
    );
    assert.equal(loc, "b:extra · 1:main");
  });

  it("formats session keys with a custom shortcut alphabet", () => {
    const custom = "0123456789abcdegiopu";
    assert.equal(formatChooseKey(14, custom), "e");
    assert.equal(formatChooseKey(15, custom), "g");
    assert.equal(formatChooseKey(16, custom), "i");
    assert.equal(formatChooseKey(16 - 1, custom), "g");
  });

  it("disambiguates duplicate repo basenames", () => {
    const trees = [
      {
        path: "/home/jasona/dev/projects/agents/feat/code-review/agents",
        vcsType: "jj" as const,
        branch: "main",
        createdByWork: false,
        dirty: false,
        ahead: null,
        behind: null,
        repoRoot: null,
      },
      {
        path: "/home/jasona/dev/projects/general-harness/agents",
        vcsType: "jj" as const,
        branch: "wlpkksunlkry",
        createdByWork: false,
        dirty: false,
        ahead: null,
        behind: null,
        repoRoot: null,
      },
    ];
    assert.equal(repoDisplayName(trees[0], trees), "code-review/agents");
    assert.equal(repoDisplayName(trees[1], trees), "general-harness/agents");
  });

  it("avoids undefined in location when fields missing", () => {
    const loc = formatWindowLocation(
      agent({
        label: "x",
        sessionIndex: undefined as unknown as number,
        sessionName: "",
        windowName: "",
      }),
      session({
        name: "proj",
        id: "$3",
        index: undefined as unknown as number,
      }),
    );
    assert.doesNotMatch(loc, /undefined/);
    assert.equal(loc, "2:proj · 1:?");
  });
});

describe("normalizeSessions", () => {
  it("derives session index from session id when missing", () => {
    const [normalized] = normalizeSessions([
      session({
        name: "tmuxr",
        id: "$3",
        index: undefined as unknown as number,
      }),
    ]);
    assert.equal(normalized.index, 3);
  });
});

describe("jj revision colors", () => {
  it("colors prefix separately from rest", () => {
    const out = coloredJjChangeId("nyu", "typxl");
    const esc = String.fromCharCode(0x1b);
    assert.match(out, /nyu/);
    assert.match(out, /typxl/);
    assert.match(out, new RegExp(`${esc}\\[1;95m`));
  });

  it("fills rest from branch when jjChangeRest empty", () => {
    const out = formatRevisionLabel({
      path: "/tmp/x",
      vcsType: "jj",
      branch: "wlpkksunlkry",
      createdByWork: false,
      dirty: false,
      ahead: null,
      behind: null,
      repoRoot: null,
      revisionKind: "change",
      jjChangePrefix: "wlp",
      jjChangeRest: "",
    });
    const esc = String.fromCharCode(0x1b);
    const plain = out.replace(new RegExp(`${esc}\\[[0-9;]*m`, "g"), "");
    assert.equal(plain, "wlpkksunlkry");
    assert.match(out, new RegExp(`${esc}\\[1;95mwlp`));
  });

  it("renders bookmarks in bright magenta", () => {
    const out = formatRevisionLabel({
      path: "/tmp/x",
      vcsType: "jj",
      branch: "main",
      createdByWork: false,
      dirty: false,
      ahead: null,
      behind: null,
      repoRoot: null,
      revisionKind: "bookmark",
      jjChangePrefix: null,
      jjChangeRest: null,
    });
    const esc = String.fromCharCode(0x1b);
    assert.match(out, new RegExp(`${esc}\\[95mmain`));
  });
});

describe("sidebar render", () => {
  it("renders agents panel and session top rule", () => {
    const sessions: SessionSnapshot[] = [
      session({
        name: "my-project",
        id: "$3",
        index: 3,
        attached: true,
        agents: [
          agent({
            label: "cursor-agent",
            status: "blocked",
            sessionIndex: 3,
            sessionName: "my-project",
            windowIndex: 0,
            windowName: "agents",
          }),
        ],
        trees: [
          {
            path: "/tmp/work",
            vcsType: "git",
            branch: "main",
            createdByWork: false,
            dirty: false,
            ahead: null,
            behind: null,
            repoRoot: null,
            revisionKind: null,
            jjChangePrefix: null,
            jjChangeRest: null,
          },
        ],
      }),
    ];

    const out = render(sessions, 50, 30, true);
    const esc = String.fromCharCode(0x1b);
    const plain = out.replace(new RegExp(`${esc}\\[[0-9;]*m`, "g"), "");
    assert.match(plain, /agents/);
    assert.match(plain, /cursor-agent/);
    assert.match(plain, /2:my-project · 1:agents/);
    assert.match(plain, /sessions/);
    assert.match(plain, /─ 2:my-project \*/);
    assert.match(plain, /work · main/);
    assert.doesNotMatch(plain, /undefined/);
  });

  it("renders each tree on its own line", () => {
    const sessions: SessionSnapshot[] = [
      session({
        name: "tmuxr",
        id: "$3",
        index: 3,
        trees: [
          {
            path: "/home/jasona/dev/projects/tmuxr/agents",
            vcsType: "jj",
            branch: "main",
            createdByWork: false,
            dirty: false,
            ahead: null,
            behind: null,
            repoRoot: null,
            revisionKind: "bookmark",
            jjChangePrefix: null,
            jjChangeRest: null,
          },
          {
            path: "/home/jasona/dev/projects/tmuxr/tmux-tmuxr",
            vcsType: "jj",
            branch: "main",
            createdByWork: false,
            dirty: false,
            ahead: null,
            behind: null,
            repoRoot: null,
            revisionKind: "bookmark",
            jjChangePrefix: null,
            jjChangeRest: null,
          },
          {
            path: "/home/jasona/dev/projects/tmuxr/work",
            vcsType: "jj",
            branch: "nyutypxllpyw",
            createdByWork: false,
            dirty: true,
            ahead: null,
            behind: null,
            repoRoot: null,
            revisionKind: "change",
            jjChangePrefix: "nyu",
            jjChangeRest: "typxllpyw",
          },
        ],
      }),
    ];

    const out = render(sessions, 40, 30, true);
    const esc = String.fromCharCode(0x1b);
    const plain = out.replace(new RegExp(`${esc}\\[[0-9;]*m`, "g"), "");
    assert.match(plain, /agents · main/);
    assert.match(plain, /tmux-tmuxr · main/);
    assert.match(plain, /work · nyutypxllpyw/);
  });

  it("disambiguates colliding repo names in session card", () => {
    const sessions: SessionSnapshot[] = [
      session({
        name: "agents",
        trees: [
          {
            path: "/home/jasona/dev/projects/agents/feat/code-review/agents",
            vcsType: "jj",
            branch: "main",
            createdByWork: false,
            dirty: false,
            ahead: null,
            behind: null,
            repoRoot: null,
            revisionKind: "bookmark",
            jjChangePrefix: null,
            jjChangeRest: null,
          },
          {
            path: "/home/jasona/dev/projects/general-harness/agents",
            vcsType: "jj",
            branch: "wlpkksunlkry",
            createdByWork: false,
            dirty: true,
            ahead: null,
            behind: null,
            repoRoot: null,
            revisionKind: "change",
            jjChangePrefix: "wl",
            jjChangeRest: "pkksunlkry",
          },
        ],
      }),
    ];

    const out = render(sessions, 50, 30, true);
    const esc = String.fromCharCode(0x1b);
    const plain = out.replace(new RegExp(`${esc}\\[[0-9;]*m`, "g"), "");
    assert.match(plain, /code-review\/agents · main/);
    assert.match(plain, /general-harness\/agents · wlpkksunlkry/);
  });

  it("produces identical output for identical sessions", () => {
    const sessions: SessionSnapshot[] = [
      session({
        name: "proj",
        agents: [agent({ label: "a1", status: "idle" })],
      }),
    ];
    const first = render(sessions, 40, 20, true);
    const second = render(sessions, 40, 20, true);
    assert.equal(first, second);
    assert.equal(snapshotFingerprint(sessions), snapshotFingerprint(sessions));
  });
});
