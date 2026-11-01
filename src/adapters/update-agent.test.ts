import assert from "node:assert/strict";
import { mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { paths } from "../config/paths.js";
import {
  applyWorkspacePoll,
  readWorkspacePoll,
  type WorkspacePoll,
} from "../daemon/state-aggregator.js";
import type { DetectedAgent } from "../scanner/detect.js";
import type { TmuxPane } from "../tmux/client.js";
import {
  type AgentRecord,
  type AgentStatus,
  createWorkspace,
  loadWorkspace,
  mutateWorkspace,
} from "../workspace/state.js";
import { applyHookStatus } from "./debounce.js";
import type { ObservationResult } from "./types.js";
import { correctAgentCli, observeAgents } from "./update-agent.js";

function pane(id: string, title: string): TmuxPane {
  return {
    id,
    title,
    currentCommand: "agent",
    currentPath: "/tmp",
    pid: 1,
    sessionName: "s",
    windowId: "@1",
    windowIndex: 0,
    windowName: "main",
    index: 0,
    width: 80,
    height: 24,
    active: true,
    workAgentLabel: null,
    workAgentCli: null,
    workSidebar: false,
  };
}

function explicitWorkingAgent(paneId: string): AgentRecord {
  return {
    label: "agent",
    cli: "agent",
    paneId,
    status: "working",
    confidence: "explicit",
    detachedAt: null,
    lastSeen: new Date().toISOString(),
  };
}

describe("observeAgents", () => {
  it("skips full observation for explicit working agents with active titles", () => {
    const agent = explicitWorkingAgent("%1");
    const paneById = new Map<string, TmuxPane>([
      ["%1", pane("%1", "⢀ agent working")],
    ]);

    const observations = observeAgents([agent], paneById);

    assert.equal(observations.size, 0);
    assert.equal(agent.status, "working");
    assert.equal(agent.confidence, "explicit");
  });
});

describe("correctAgentCli", () => {
  it("corrects a cli: agent record once its CLI is known", () => {
    const agent = explicitWorkingAgent("%1");

    assert.equal(correctAgentCli(agent, "claude"), true);
    assert.equal(agent.cli, "claude");
    assert.equal(agent.label, "agent");
  });

  it("leaves a Cursor record alone when Cursor's hook reports agent", () => {
    const agent = explicitWorkingAgent("%1");

    assert.equal(correctAgentCli(agent, "agent"), false);
    assert.equal(agent.cli, "agent");
  });

  it("never rewrites a record whose CLI is already known", () => {
    const agent = { ...explicitWorkingAgent("%1"), cli: "claude" };

    assert.equal(correctAgentCli(agent, "agent"), false);
    assert.equal(correctAgentCli(agent, "codex"), false);
    assert.equal(agent.cli, "claude");
  });
});

describe("applyWorkspacePoll", { concurrency: false }, () => {
  const saved = {
    XDG_STATE_HOME: process.env.XDG_STATE_HOME,
    XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
    XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR,
  };
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "work-poll-test-"));
    process.env.XDG_STATE_HOME = join(home, "state");
    process.env.XDG_CONFIG_HOME = join(home, "config");
    process.env.XDG_RUNTIME_DIR = join(home, "runtime");
    createWorkspace("w", "s", true);
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(home, { recursive: true, force: true });
  });

  function seed(agent: AgentRecord): void {
    mutateWorkspace("w", (ws) => {
      ws.agents[agent.label] = agent;
      return true;
    });
  }

  function detected(paneId: string, cli = "claude"): DetectedAgent {
    return {
      paneId,
      cli,
      paneTitle: "",
      currentPath: "/tmp",
      windowIndex: 0,
      paneIndex: 0,
      sessionName: "s",
    };
  }

  function poll(fields: Partial<WorkspacePoll>): WorkspacePoll {
    return {
      detected: [],
      paneById: new Map(),
      probes: new Map(),
      observations: new Map(),
      lastSeenAtRead: new Map(
        Object.values(loadWorkspace("w")?.agents ?? {}).map((a) => [
          a.label,
          a.lastSeen,
        ]),
      ),
      ...fields,
    };
  }

  function observed(status: AgentStatus): ObservationResult {
    return {
      status,
      confidence: "inferred",
      manifestState: "working",
      rulePriority: 1,
    };
  }

  const stored = (label: string) => loadWorkspace("w")?.agents[label];

  it("keeps a hook status that landed after the poll's read", () => {
    const record = { ...explicitWorkingAgent("%1"), label: "a", cli: "claude" };
    seed({ ...record, confidence: "heuristic" });
    const p = pane("%1", "");
    const read = poll({
      detected: [detected("%1")],
      paneById: new Map([["%1", p]]),
      observations: new Map([["%1", { pane: p, result: observed("working") }]]),
    });

    mutateWorkspace("w", (ws) => {
      applyHookStatus(ws.agents.a, "blocked", "permissionRequest");
      return true;
    });
    applyWorkspacePoll("w", read);

    assert.equal(stored("a")?.status, "blocked");
    assert.equal(stored("a")?.confidence, "explicit");
    assert.equal(stored("a")?.hookEvent, "permissionRequest");
  });

  it("keeps a hook status that landed after an idle capture", () => {
    const record = { ...explicitWorkingAgent("%1"), label: "a", cli: "claude" };
    seed({ ...record, status: "idle", lastSeen: "2026-01-01T00:00:00.000Z" });
    const p = pane("%1", "");
    const read = poll({
      detected: [detected("%1")],
      paneById: new Map([["%1", p]]),
      observations: new Map([["%1", { pane: p, result: observed("idle") }]]),
    });

    mutateWorkspace("w", (ws) => {
      applyHookStatus(ws.agents.a, "working", "preToolUse");
      return true;
    });
    applyWorkspacePoll("w", read);

    assert.equal(stored("a")?.status, "working");
    assert.equal(stored("a")?.confidence, "explicit");
  });

  it("applies an idle capture to an explicit status when no hook landed", () => {
    const record = { ...explicitWorkingAgent("%1"), label: "a", cli: "claude" };
    seed(record);
    const p = pane("%1", "");
    applyWorkspacePoll(
      "w",
      poll({
        detected: [detected("%1")],
        paneById: new Map([["%1", p]]),
        observations: new Map([["%1", { pane: p, result: observed("idle") }]]),
      }),
    );

    assert.equal(stored("a")?.status, "idle");
  });

  it("applies an observation to a newly detected agent", () => {
    const p = pane("%2", "");
    applyWorkspacePoll(
      "w",
      poll({
        detected: [detected("%2")],
        paneById: new Map([["%2", p]]),
        observations: new Map([
          ["%2", { pane: p, result: observed("blocked") }],
        ]),
      }),
    );

    assert.equal(stored("claude")?.status, "blocked");
  });

  it("applies an observation to a reattached agent", () => {
    seed({
      ...explicitWorkingAgent("%1"),
      label: "a",
      cli: "claude",
      paneId: null,
      status: "detached",
      confidence: "none",
      detachedAt: new Date().toISOString(),
    });
    const p = pane("%3", "");
    applyWorkspacePoll(
      "w",
      poll({
        detected: [detected("%3")],
        paneById: new Map([["%3", p]]),
        observations: new Map([
          ["%3", { pane: p, result: observed("blocked") }],
        ]),
      }),
    );

    assert.equal(stored("a")?.status, "blocked");
  });

  it("applies an observation when no hook landed", () => {
    seed({
      ...explicitWorkingAgent("%1"),
      label: "a",
      confidence: "heuristic",
    });
    const p = pane("%1", "");
    applyWorkspacePoll(
      "w",
      poll({
        detected: [detected("%1")],
        paneById: new Map([["%1", p]]),
        observations: new Map([
          ["%1", { pane: p, result: observed("blocked") }],
        ]),
      }),
    );

    assert.equal(stored("a")?.status, "blocked");
    assert.equal(stored("a")?.confidence, "inferred");
  });

  it("persists a newly detected agent and returns its pane options", () => {
    const { paneOptions } = applyWorkspacePoll(
      "w",
      poll({
        detected: [detected("%2")],
        paneById: new Map([["%2", pane("%2", "")]]),
      }),
    );

    assert.equal(stored("claude")?.paneId, "%2");
    assert.deepEqual(
      paneOptions.map((o) => o.name),
      ["@work-agent-label", "@work-agent-cli"],
    );
  });

  it("persists a reattached agent", () => {
    seed({
      ...explicitWorkingAgent("%1"),
      label: "a",
      cli: "claude",
      paneId: null,
      status: "detached",
      confidence: "none",
      detachedAt: new Date().toISOString(),
    });
    applyWorkspacePoll(
      "w",
      poll({
        detected: [detected("%3")],
        paneById: new Map([["%3", pane("%3", "")]]),
      }),
    );

    assert.equal(stored("a")?.paneId, "%3");
    assert.equal(stored("a")?.status, "unknown");
    assert.equal(stored("a")?.detachedAt, null);
  });

  it("takes lastSeen at the read before sync moves it on the snapshot", () => {
    const lastSeen = "2026-01-01T00:00:00.000Z";
    seed({
      ...explicitWorkingAgent("%1"),
      label: "a",
      cli: "claude",
      paneId: null,
      status: "detached",
      confidence: "none",
      lastSeen,
    });
    const snapshot = loadWorkspace("w");
    assert.ok(snapshot);

    // No pane to look up, so this reattaches without a capture.
    const read = readWorkspacePoll(snapshot, [detected("%3")], new Map());

    assert.notEqual(snapshot.agents.a.lastSeen, lastSeen);
    assert.equal(read.lastSeenAtRead.get("a"), lastSeen);
  });

  it("keeps an agent a hook made explicit after the read skipped its probe", () => {
    seed({ ...explicitWorkingAgent("%1"), label: "a" });
    const read = poll({ paneById: new Map([["%1", pane("%1", "")]]) });

    applyWorkspacePoll("w", read);

    assert.equal(stored("a")?.status, "working");
    assert.equal(stored("a")?.paneId, "%1");
  });

  it("detaches an unlabelled, unconfirmed agent without a probe", () => {
    seed({
      ...explicitWorkingAgent("%1"),
      label: "a",
      confidence: "heuristic",
    });
    applyWorkspacePoll(
      "w",
      poll({ paneById: new Map([["%1", pane("%1", "")]]) }),
    );

    assert.equal(stored("a")?.status, "detached");
  });

  it("gives up on a held lock without throwing, leaving the record", () => {
    seed({ ...explicitWorkingAgent("%1"), label: "a" });
    const lock = join(paths.workspacesDir, "w.lock");
    writeFileSync(lock, "");

    const { state, paneOptions } = applyWorkspacePoll("w", poll({}));

    unlinkSync(lock);
    assert.equal(state, null);
    assert.deepEqual(paneOptions, []);
    assert.equal(stored("a")?.status, "working");
  });

  it("leaves a record alone when the poll's read never saw its pane", () => {
    seed({ ...explicitWorkingAgent("%9"), label: "a" });
    applyWorkspacePoll("w", poll({}));

    assert.equal(stored("a")?.status, "working");
    assert.equal(stored("a")?.paneId, "%9");
  });

  it("detaches an agent whose pane the poll's read found gone", () => {
    seed({ ...explicitWorkingAgent("%9"), label: "a" });
    applyWorkspacePoll(
      "w",
      poll({
        probes: new Map([["a\0%9", { hostsAgent: false, detected: false }]]),
      }),
    );

    assert.equal(stored("a")?.status, "detached");
    assert.equal(stored("a")?.paneId, null);
  });
});
