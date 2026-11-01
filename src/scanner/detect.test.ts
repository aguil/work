import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  applyWorkspacePoll,
  readWorkspacePoll,
} from "../daemon/state-aggregator.js";
import type { TmuxPane } from "../tmux/client.js";
import {
  loadWorkspace,
  saveWorkspace,
  type WorkspaceState,
} from "../workspace/state.js";
import {
  clearAgentProcessCache,
  detectAgents,
  detectSinglePane,
  paneHostsAgentProcess,
  paneStillHostsAgent,
} from "./detect.js";

const PANE_PID = 1000;

function pane(id: string, pid: number, labelled = true): TmuxPane {
  return {
    id,
    sessionName: "s",
    windowId: "@1",
    windowIndex: 0,
    windowName: "w",
    index: 0,
    pid,
    currentCommand: "zsh",
    currentPath: "/tmp",
    title: "",
    width: 80,
    height: 24,
    active: false,
    workSidebar: false,
    workAgentCli: labelled ? "claude" : null,
    workAgentLabel: labelled ? "claude-1" : null,
  };
}

/** A pane shell, `depth - 1` wrappers under it, and the agent at the bottom. */
function chain(depth: number, rootPid = PANE_PID, agent = "claude"): string[] {
  const rows = [`${rootPid} 1 -zsh`];
  for (let i = 1; i < depth; i++) {
    rows.push(`${rootPid + i} ${rootPid + i - 1} wrapper --level ${i}`);
  }
  rows.push(`${rootPid + depth} ${rootPid + depth - 1} node /opt/${agent}`);
  return rows;
}

describe("process table", { concurrency: false }, () => {
  const saved = {
    PATH: process.env.PATH,
    XDG_STATE_HOME: process.env.XDG_STATE_HOME,
    XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
    XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR,
  };
  let home: string;
  let tablePath: string;
  let callsPath: string;

  const setTable = (rows: string[]): void => {
    writeFileSync(tablePath, `${rows.join("\n")}\n`);
  };
  const calls = (): string[] => {
    try {
      return readFileSync(callsPath, "utf-8").trim().split("\n");
    } catch {
      return [];
    }
  };
  const fakeTool = (name: string, body: string): void => {
    const file = join(home, name);
    writeFileSync(file, `#!/bin/sh\necho ${name} >> "${callsPath}"\n${body}\n`);
    chmodSync(file, 0o755);
  };

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "work-detect-"));
    tablePath = join(home, "table");
    callsPath = join(home, "calls");
    process.env.XDG_STATE_HOME = join(home, "state");
    process.env.XDG_CONFIG_HOME = join(home, "config");
    process.env.XDG_RUNTIME_DIR = join(home, "runtime");
    fakeTool("ps", `cat "${tablePath}"`);
    fakeTool("pgrep", "exit 1");
    fakeTool("tmux", "exit 0");
    process.env.PATH = `${home}:${saved.PATH}`;
    clearAgentProcessCache();
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    clearAgentProcessCache();
    rmSync(home, { recursive: true, force: true });
  });

  for (const depth of [6, 20]) {
    it(`finds an agent ${depth} levels down by its known CLI`, () => {
      setTable(chain(depth));
      assert.equal(paneHostsAgentProcess(pane("%1", PANE_PID), "claude"), true);
    });

    it(`names an agent ${depth} levels down from the configured CLIs`, () => {
      setTable(chain(depth));
      const registered = { ...pane("%1", PANE_PID), workAgentCli: null };
      assert.equal(detectSinglePane(registered)?.cli, "claude");
    });
  }

  it("does not find an agent outside the pane's own tree", () => {
    setTable([...chain(2, PANE_PID, "shell"), ...chain(2, 2000)]);
    assert.equal(paneHostsAgentProcess(pane("%1", PANE_PID), "claude"), false);
  });

  it("survives a cycle in the table", () => {
    setTable(["1000 1001 sh", "1001 1000 sh"]);
    assert.equal(paneHostsAgentProcess(pane("%1", PANE_PID), "claude"), false);
  });

  it("reads a table too large for the default output buffer", () => {
    const padding = "x".repeat(200);
    const rows = Array.from(
      { length: 8000 },
      (_, i) => `${5000 + i} 2 idle ${padding}`,
    );
    setTable([...rows, ...chain(1)]);
    assert.equal(paneHostsAgentProcess(pane("%1", PANE_PID), "claude"), true);
    // A failed read also answers true, so only this side shows the table parsed.
    assert.equal(paneHostsAgentProcess(pane("%2", 5000), "claude"), false);
  });

  it("issues one ps call per poll across panes, and no pgrep", () => {
    setTable([...chain(6), ...chain(6, 2000), ...chain(6, 3000)]);
    const panes = [
      pane("%1", PANE_PID),
      pane("%2", 2000),
      pane("%3", 3000),
      { ...pane("%4", 4000), workAgentCli: null },
    ];
    clearAgentProcessCache();
    assert.equal(
      detectAgents(panes, undefined, { preserveCache: true }).length,
      3,
    );
    assert.equal(paneStillHostsAgent(panes[0], "claude"), true);
    assert.equal(detectSinglePane(panes[3], { preserveCache: true }), null);
    assert.deepEqual(calls(), ["ps"]);
  });

  it("reads the table only when a walk needs it", () => {
    setTable(chain(1));
    const foreground = { ...pane("%1", PANE_PID), currentCommand: "claude" };
    assert.equal(
      detectSinglePane({ ...foreground, workAgentLabel: null })?.cli,
      "claude",
    );
    assert.deepEqual(calls(), []);
  });

  it("reads a fresh table after the cache is cleared", () => {
    setTable(chain(6));
    assert.equal(paneHostsAgentProcess(pane("%1", PANE_PID), "claude"), true);
    setTable(["1000 1 -zsh"]);
    assert.equal(paneHostsAgentProcess(pane("%1", PANE_PID), "claude"), true);
    clearAgentProcessCache();
    assert.equal(paneHostsAgentProcess(pane("%1", PANE_PID), "claude"), false);
    assert.deepEqual(calls(), ["ps", "ps"]);
  });

  it("does not take a failed ps as every agent gone, and tries once", () => {
    fakeTool("ps", "exit 1");
    const panes = [pane("%1", PANE_PID), pane("%2", 2000)];
    assert.equal(paneHostsAgentProcess(panes[0], "claude"), true);
    assert.equal(paneHostsAgentProcess(panes[1], "claude"), true);
    assert.deepEqual(calls(), ["ps"]);
  });

  it("does not detect an agent from a failed ps", () => {
    fakeTool("ps", "exit 1");
    const stale = pane("%1", PANE_PID);
    const cursorTitle = {
      ...pane("%2", 2000, false),
      title: "Agent - ⏳ Working",
    };
    clearAgentProcessCache();
    assert.deepEqual(
      detectAgents([stale, cursorTitle], undefined, { preserveCache: true }),
      [],
    );
    assert.equal(paneStillHostsAgent(stale, "claude"), true);
    assert.deepEqual(calls(), ["ps"]);
  });

  it("marks an agent detached once its process has gone", () => {
    const paneOne = pane("%1", PANE_PID);
    const ws: WorkspaceState = {
      name: "w",
      sessionName: "s",
      agents: {
        "claude-1": {
          label: "claude-1",
          cli: "claude",
          paneId: "%1",
          status: "working",
          confidence: "heuristic",
          detachedAt: null,
          lastSeen: new Date(0).toISOString(),
        },
      },
      trees: [],
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      createdByWork: false,
      archived: false,
    };
    saveWorkspace(ws);
    const poll = (): WorkspaceState | null => {
      clearAgentProcessCache();
      const detected = detectAgents([paneOne], undefined, {
        preserveCache: true,
      });
      const snapshot = loadWorkspace("w") as WorkspaceState;
      const read = readWorkspacePoll(
        snapshot,
        detected,
        new Map([["%1", paneOne]]),
      );
      return applyWorkspacePoll("w", read).state;
    };

    setTable(chain(6));
    assert.notEqual(poll()?.agents["claude-1"].status, "detached");

    setTable(["1000 1 -zsh"]);
    const after = poll()?.agents["claude-1"];
    assert.equal(after?.status, "detached");
    assert.equal(after?.paneId, null);
  });

  it("finds a real process six levels down with the real ps", async () => {
    process.env.PATH = saved.PATH;
    const script = join(home, "wrap.sh");
    writeFileSync(
      script,
      [
        'if [ "$1" -gt 0 ]; then sh "$0" $(($1 - 1)); exit; fi',
        "exec sh -c 'sleep 30; :' claude",
      ].join("\n"),
    );
    const root = spawn("sh", [script, "5"], {
      detached: true,
      stdio: "ignore",
    });
    try {
      const realPane = pane("%1", root.pid ?? 0);
      let found = false;
      for (let i = 0; i < 100 && !found; i++) {
        clearAgentProcessCache();
        found = paneHostsAgentProcess(realPane, "claude");
        if (!found) await new Promise((r) => setTimeout(r, 20));
      }
      assert.equal(found, true);
    } finally {
      process.kill(-(root.pid ?? 0), "SIGKILL");
    }
  });
});
