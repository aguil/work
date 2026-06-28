import * as tmux from "../tmux/client.js";
import { detectAgents, isSidebarPane } from "../scanner/detect.js";
import {
  listWorkspaces,
  saveWorkspace,
  upsertAgent,
  autoLabel,
  findAgentByPane,
  type WorkspaceState,
  type AgentRecord,
} from "../workspace/state.js";
import type { SessionSnapshot } from "./protocol.js";
import { enrichTree } from "../vcs/detect.js";

export interface AggregatedState {
  sessions: SessionSnapshot[];
  timestamp: string;
}

export function aggregateState(): AggregatedState {
  const tmuxSessions = tmux.listSessions();
  const allPanes = tmux.listPanes();
  const workspaces = listWorkspaces().filter((w) => !w.archived);
  const wsMap = new Map(workspaces.map((w) => [w.sessionName, w]));

  const sidebarPaneIds = new Set(
    allPanes.filter(isSidebarPane).map((p) => p.id),
  );

  const sessions: SessionSnapshot[] = [];

  for (const session of tmuxSessions) {
    const ws = wsMap.get(session.name);
    const sessionPanes = allPanes.filter(
      (p) => p.sessionName === session.name,
    );
    const detected = detectAgents(sessionPanes, sidebarPaneIds);

    let agents: AgentRecord[] = [];

    if (ws) {
      syncAgentsToWorkspace(ws, detected);
      agents = Object.values(ws.agents);
    } else {
      agents = detected.map((d) => ({
        label: d.cli,
        cli: d.cli,
        paneId: d.paneId,
        status: "unknown" as const,
        confidence: "none" as const,
        detachedAt: null,
        lastSeen: new Date().toISOString(),
      }));
    }

    sessions.push({
      id: session.id,
      name: session.name,
      windowCount: session.windowCount,
      attached: session.attached,
      tracked: ws != null,
      workspaceName: ws?.name ?? null,
      agents,
      trees: (ws?.trees ?? []).map(enrichTree),
    });
  }

  return {
    sessions,
    timestamp: new Date().toISOString(),
  };
}

function syncAgentsToWorkspace(
  ws: WorkspaceState,
  detected: ReturnType<typeof detectAgents>,
): void {
  const detectedPaneIds = new Set(detected.map((d) => d.paneId));
  let changed = false;

  for (const d of detected) {
    const existing = findAgentByPane(ws, d.paneId);
    if (existing) {
      if (existing.status === "detached") {
        existing.status = "unknown";
        existing.detachedAt = null;
        existing.lastSeen = new Date().toISOString();
        changed = true;
      }
    } else {
      const label = autoLabel(d.cli, ws);
      upsertAgent(ws, {
        label,
        cli: d.cli,
        paneId: d.paneId,
        status: "unknown",
        confidence: "none",
        detachedAt: null,
        lastSeen: new Date().toISOString(),
      });
      changed = true;
    }
  }

  for (const agent of Object.values(ws.agents)) {
    if (
      agent.paneId &&
      agent.status !== "detached" &&
      !detectedPaneIds.has(agent.paneId)
    ) {
      agent.status = "detached";
      agent.detachedAt = new Date().toISOString();
      agent.paneId = null;
      changed = true;
    }
  }

  if (changed) {
    saveWorkspace(ws);
  }
}
