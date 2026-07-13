import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TmuxPane } from "../tmux/client.js";
import type { AgentRecord } from "../workspace/state.js";
import { observeAgentsInWorkspace } from "./update-agent.js";

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

describe("observeAgentsInWorkspace", () => {
  it("skips full observation for explicit working agents with active titles", () => {
    const agent = explicitWorkingAgent("%1");
    const paneById = new Map<string, TmuxPane>([
      ["%1", pane("%1", "⢀ agent working")],
    ]);

    const changed = observeAgentsInWorkspace([agent], paneById);

    assert.equal(changed, false);
    assert.equal(agent.status, "working");
    assert.equal(agent.confidence, "explicit");
  });
});
