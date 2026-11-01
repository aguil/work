import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
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
import { applyHookEvent } from "./apply-hook-event.js";
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

  const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
  const minutes = (n: number) => n * 60_000;

  function pollPane(paneId = "%1"): WorkspacePoll {
    return poll({
      detected: [detected(paneId)],
      paneById: new Map([[paneId, pane(paneId, "")]]),
    });
  }

  it("drops an explicit status to heuristic once hooks are quiet for 15 minutes", () => {
    seed({
      ...explicitWorkingAgent("%1"),
      label: "a",
      cli: "claude",
      lastHookEventAt: ago(minutes(15) + 1000),
    });
    applyWorkspacePoll("w", pollPane());

    assert.equal(stored("a")?.confidence, "heuristic");
    assert.equal(stored("a")?.status, "working");
  });

  it("keeps an explicit status inside the 15 minutes", () => {
    seed({
      ...explicitWorkingAgent("%1"),
      label: "a",
      lastHookEventAt: ago(minutes(14)),
    });
    applyWorkspacePoll("w", pollPane());

    assert.equal(stored("a")?.confidence, "explicit");
  });

  it("does not age an agent whose pane is gone from the read", () => {
    seed({
      ...explicitWorkingAgent("%1"),
      label: "a",
      lastHookEventAt: ago(minutes(20)),
    });
    applyWorkspacePoll("w", poll({}));

    assert.equal(stored("a")?.confidence, "explicit");
  });

  it("starts the clock on a record from before the field, then ages it", () => {
    seed({ ...explicitWorkingAgent("%1"), label: "a", cli: "claude" });
    applyWorkspacePoll("w", pollPane());

    assert.equal(stored("a")?.confidence, "explicit");
    assert.ok(stored("a")?.lastHookEventAt);

    mutateWorkspace("w", (ws) => {
      ws.agents.a.lastHookEventAt = ago(minutes(16));
      return true;
    });
    applyWorkspacePoll("w", pollPane());

    assert.equal(stored("a")?.confidence, "heuristic");
  });

  function transcript(ageMs: number): string {
    const path = join(home, "transcript.jsonl");
    writeFileSync(path, "{}\n");
    const when = new Date(Date.now() - ageMs);
    utimesSync(path, when, when);
    return path;
  }

  function claudeWorking(ageMs: number, fields?: Partial<AgentRecord>): void {
    seed({
      ...explicitWorkingAgent("%1"),
      label: "a",
      cli: "claude",
      transcriptPath: transcript(ageMs),
      promptId: "p1",
      lastHookEventAt: ago(ageMs),
      ...fields,
    });
  }

  function cursorWorking(fields?: Partial<AgentRecord>): void {
    seed({
      ...explicitWorkingAgent("%1"),
      label: "a",
      lastHookEventAt: ago(minutes(16)),
      ...fields,
    });
  }

  function pollWith(status: AgentStatus): WorkspacePoll {
    const p = pane("%1", "");
    return poll({
      detected: [detected("%1")],
      paneById: new Map([["%1", p]]),
      observations: new Map([["%1", { pane: p, result: observed(status) }]]),
    });
  }

  it("stalls a working Claude agent after 120s of an unchanged transcript", () => {
    claudeWorking(minutes(3));
    applyWorkspacePoll("w", pollPane());

    assert.equal(stored("a")?.status, "unknown");
    assert.equal(stored("a")?.confidence, "heuristic");
    assert.ok(stored("a")?.stalledAt);
  });

  it("stalls at any confidence", () => {
    claudeWorking(minutes(3), { confidence: "heuristic" });
    applyWorkspacePoll("w", pollPane());

    assert.equal(stored("a")?.status, "unknown");
  });

  it("does not stall inside 120s of the transcript changing", () => {
    claudeWorking(minutes(1));
    applyWorkspacePoll("w", pollPane());

    assert.equal(stored("a")?.status, "working");
  });

  it("does not stall inside 120s of a hook, even with an old transcript", () => {
    claudeWorking(minutes(3), { lastHookEventAt: ago(minutes(1)) });
    applyWorkspacePoll("w", pollPane());

    assert.equal(stored("a")?.status, "working");
  });

  it("does not stall a Claude agent with no turn", () => {
    claudeWorking(minutes(3), { promptId: undefined });
    applyWorkspacePoll("w", pollPane());

    assert.equal(stored("a")?.status, "working");
  });

  it("stalls only an agent reading working", () => {
    claudeWorking(minutes(3), { status: "idle" });
    applyWorkspacePoll("w", pollPane());

    assert.equal(stored("a")?.status, "idle");
    assert.ok(!stored("a")?.stalledAt);
  });

  for (const status of ["blocked", "idle", "done", "error"] as const) {
    it(`applies an observation of ${status} while stalled`, () => {
      claudeWorking(minutes(3));
      applyWorkspacePoll("w", pollPane());

      // Three reads: idle takes three confirmations from unknown.
      applyWorkspacePoll("w", pollWith(status));
      applyWorkspacePoll("w", pollWith(status));
      applyWorkspacePoll("w", pollWith(status));

      assert.equal(stored("a")?.status, status);
    });
  }

  it("ignores an observation of working while stalled", () => {
    claudeWorking(minutes(3));
    applyWorkspacePoll("w", pollPane());

    applyWorkspacePoll("w", pollWith("working"));

    assert.equal(stored("a")?.status, "unknown");
    assert.ok(stored("a")?.stalledAt);
  });

  it("clears the stall when the transcript changes", () => {
    claudeWorking(minutes(3));
    applyWorkspacePoll("w", pollPane());
    const path = stored("a")?.transcriptPath;
    assert.ok(path);
    const later = new Date(Date.now() + 5000);
    utimesSync(path, later, later);

    applyWorkspacePoll("w", pollWith("working"));

    assert.ok(!stored("a")?.stalledAt);
    assert.equal(stored("a")?.status, "working");
  });

  it("stalls a working Cursor agent after 15 quiet minutes, with no file", () => {
    cursorWorking();
    applyWorkspacePoll("w", pollPane());

    assert.equal(stored("a")?.status, "unknown");
    assert.ok(stored("a")?.stalledAt);
  });

  it("does not stall a Cursor agent inside 15 minutes", () => {
    cursorWorking({ lastHookEventAt: ago(minutes(14)) });
    applyWorkspacePoll("w", pollPane());

    assert.equal(stored("a")?.status, "working");
  });

  it("ignores a transcript on a Cursor agent", () => {
    cursorWorking({
      lastHookEventAt: ago(minutes(14)),
      transcriptPath: transcript(minutes(14)),
      promptId: "p1",
    });
    applyWorkspacePoll("w", pollPane());

    assert.equal(stored("a")?.status, "working");
  });

  it("never stalls a Cursor agent no hook has reached", () => {
    cursorWorking({ lastHookEventAt: undefined, confidence: "heuristic" });
    applyWorkspacePoll("w", pollPane());

    assert.equal(stored("a")?.status, "working");
    assert.ok(!stored("a")?.stalledAt);
  });

  it("keeps a hook status that landed after the poll's read", () => {
    const record = { ...explicitWorkingAgent("%1"), label: "a", cli: "claude" };
    seed({
      ...record,
      confidence: "heuristic",
      lastSeen: "2026-01-01T00:00:00.000Z",
    });
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

  it("does not let an observation of working replace an explicit status", () => {
    seed({ ...explicitWorkingAgent("%1"), label: "a", status: "blocked" });
    const p = pane("%1", "");
    applyWorkspacePoll(
      "w",
      poll({
        detected: [detected("%1")],
        paneById: new Map([["%1", p]]),
        observations: new Map([
          ["%1", { pane: p, result: observed("working") }],
        ]),
      }),
    );

    assert.equal(stored("a")?.status, "blocked");
    assert.equal(stored("a")?.confidence, "explicit");
  });

  for (const status of ["idle", "blocked", "done", "error"] as const) {
    it(`lets a fresh observation of ${status} replace an explicit status`, () => {
      seed({ ...explicitWorkingAgent("%1"), label: "a", cli: "claude" });
      const p = pane("%1", "");
      applyWorkspacePoll(
        "w",
        poll({
          detected: [detected("%1")],
          paneById: new Map([["%1", p]]),
          observations: new Map([
            ["%1", { pane: p, result: observed(status) }],
          ]),
        }),
      );

      assert.equal(stored("a")?.status, status);
      assert.equal(stored("a")?.confidence, "inferred");
    });
  }

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
    const read = poll({
      paneById: new Map([["%1", pane("%1", "")]]),
      probes: new Map([["a\0%1", null]]),
    });

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
      poll({
        paneById: new Map([["%1", pane("%1", "")]]),
        probes: new Map([["a\0%1", null]]),
      }),
    );

    assert.equal(stored("a")?.status, "detached");
  });

  it("leaves an agent launched during the poll for the next poll", () => {
    seed({
      ...explicitWorkingAgent("%7"),
      label: "a",
      status: "unknown",
      confidence: "none",
    });
    applyWorkspacePoll("w", poll({}));

    assert.equal(stored("a")?.status, "unknown");
    assert.equal(stored("a")?.paneId, "%7");
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

  it("keeps a hook status that landed after a negative probe", () => {
    seed({
      ...explicitWorkingAgent("%9"),
      label: "a",
      lastSeen: "2026-01-01T00:00:00.000Z",
    });
    const read = poll({
      probes: new Map([["a\0%9", { hostsAgent: false, detected: false }]]),
    });

    mutateWorkspace("w", (ws) => {
      applyHookStatus(ws.agents.a, "blocked", "permissionRequest");
      return true;
    });
    applyWorkspacePoll("w", read);

    assert.equal(stored("a")?.status, "blocked");
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

describe("hook event ordering", { concurrency: false }, () => {
  const saved = {
    XDG_STATE_HOME: process.env.XDG_STATE_HOME,
    XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
    XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR,
    TMUX: process.env.TMUX,
    TMUX_PANE: process.env.TMUX_PANE,
  };
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "work-order-test-"));
    process.env.XDG_STATE_HOME = join(home, "state");
    process.env.XDG_CONFIG_HOME = join(home, "config");
    process.env.XDG_RUNTIME_DIR = join(home, "runtime");
    delete process.env.TMUX;
    delete process.env.TMUX_PANE;
    createWorkspace("w", "s", true);
    mutateWorkspace("w", (ws) => {
      ws.agents.a = {
        ...explicitWorkingAgent("%1"),
        label: "a",
        cli: "claude",
        conversationId: "c",
      };
      return true;
    });
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(home, { recursive: true, force: true });
  });

  function fire(event: string, eventTs?: number): boolean {
    return applyHookEvent(
      { hook_event_name: event, session_id: "c" },
      { eventTs },
    ).applied;
  }

  const agent = () => loadWorkspace("w")?.agents.a;

  it("drops an event older than the last applied one", () => {
    assert.equal(fire("Stop", 200), true);
    const before = agent();

    assert.equal(fire("PreToolUse", 100), false);

    // Only the liveness stamp moves, which every event updates (AC-15).
    assert.deepEqual(
      { ...agent(), lastHookEventAt: before?.lastHookEventAt },
      before,
    );
  });

  it("records every event, one with no status included, without moving lastSeen", () => {
    fire("Stop", 200);
    mutateWorkspace("w", (ws) => {
      ws.agents.a.lastHookEventAt = "2026-01-01T00:00:00.000Z";
      return true;
    });
    const lastSeen = agent()?.lastSeen;

    assert.equal(fire("PostToolUse"), false);

    assert.notEqual(agent()?.lastHookEventAt, "2026-01-01T00:00:00.000Z");
    assert.equal(agent()?.lastSeen, lastSeen);
  });

  it("records an event it drops as older, since the agent is still alive", () => {
    fire("Stop", 200);
    mutateWorkspace("w", (ws) => {
      ws.agents.a.lastHookEventAt = "2026-01-01T00:00:00.000Z";
      return true;
    });

    assert.equal(fire("PreToolUse", 100), false);

    assert.notEqual(agent()?.lastHookEventAt, "2026-01-01T00:00:00.000Z");
    assert.equal(agent()?.status, "idle");
  });

  it("stores the transcript and turn from a hook payload", () => {
    applyHookEvent({
      hook_event_name: "PreToolUse",
      session_id: "c",
      transcript_path: "/tmp/t.jsonl",
      prompt_id: "p1",
    });

    assert.equal(agent()?.transcriptPath, "/tmp/t.jsonl");
    assert.equal(agent()?.promptId, "p1");
  });

  it("clears a stall on an event with no status", () => {
    mutateWorkspace("w", (ws) => {
      ws.agents.a.stalledAt = new Date().toISOString();
      return true;
    });

    fire("PostToolUse");

    assert.ok(!agent()?.stalledAt);
  });

  it("clears a stall on an event with a status", () => {
    mutateWorkspace("w", (ws) => {
      ws.agents.a.stalledAt = new Date().toISOString();
      return true;
    });

    fire("PreToolUse");

    assert.ok(!agent()?.stalledAt);
    assert.equal(agent()?.status, "working");
  });

  it("applies an event with an equal timestamp", () => {
    fire("Stop", 200);

    assert.equal(fire("PreToolUse", 200), true);
    assert.equal(agent()?.status, "working");
  });

  it("applies a newer event and advances the timestamp", () => {
    fire("Stop", 200);

    assert.equal(fire("PreToolUse", 300), true);
    assert.equal(agent()?.status, "working");
    assert.equal(agent()?.lastEventTs, 300);
  });

  it("keeps the timestamp when the event changes nothing else", () => {
    fire("Stop", 200);
    fire("Stop", 300);

    assert.equal(agent()?.lastEventTs, 300);
  });

  it("applies an event with no timestamp, from a script not yet reinstalled", () => {
    fire("Stop", 200);

    assert.equal(fire("PreToolUse"), true);
    assert.equal(agent()?.status, "working");
    assert.equal(agent()?.lastEventTs, 200);
  });
});
