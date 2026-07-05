import { hasExplicitHookStatus } from "../adapters/debounce.js";
import { observeAgentsInWorkspace } from "../adapters/update-agent.js";
import { getConfigValue } from "../config/store.js";
import { detectAgents, isSidebarPane } from "../scanner/detect.js";
import * as tmux from "../tmux/client.js";
import type { TreeView } from "../vcs/detect.js";
import {
  type AgentRecord,
  autoLabel,
  findAgentByPane,
  listWorkspaces,
  saveWorkspace,
  upsertAgent,
  type WorkspaceState,
} from "../workspace/state.js";
import type { SessionSnapshot } from "./protocol.js";

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
    const sessionPanes = allPanes.filter((p) => p.sessionName === session.name);
    const detected = detectAgents(sessionPanes, sidebarPaneIds);

    let agents: AgentRecord[] = [];

    if (ws) {
      syncAgentsToWorkspace(ws, detected);
      if (observeAgentsInWorkspace(Object.values(ws.agents))) {
        saveWorkspace(ws);
      }
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
      trees: (ws?.trees ?? []).map(
        (tree): TreeView => ({
          ...tree,
          dirty: false,
          ahead: null,
          behind: null,
          repoRoot: null,
        }),
      ),
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
      let detachedMatch = Object.values(ws.agents).find(
        (a) => a.status === "detached" && a.cli === d.cli && !a.paneId,
      );
      if (!detachedMatch) {
        const pane = tmux.getPane(d.paneId);
        if (pane?.workAgentLabel) {
          detachedMatch = Object.values(ws.agents).find(
            (a) =>
              a.status === "detached" &&
              !a.paneId &&
              a.label === pane.workAgentLabel,
          );
        }
      }
      if (detachedMatch) {
        detachedMatch.paneId = d.paneId;
        detachedMatch.status = "unknown";
        detachedMatch.detachedAt = null;
        detachedMatch.lastSeen = new Date().toISOString();
        changed = true;
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
  }

  for (const agent of Object.values(ws.agents)) {
    if (!agent.paneId && agent.status !== "detached") {
      agent.status = "detached";
      if (!agent.detachedAt) {
        agent.detachedAt = new Date().toISOString();
      }
      agent.confidence = "none";
      changed = true;
      continue;
    }

    if (
      agent.paneId &&
      agent.status !== "detached" &&
      !detectedPaneIds.has(agent.paneId)
    ) {
      const pane = tmux.getPane(agent.paneId);
      const cliSet = new Set(
        getConfigValue("agent-clis").map((c) => c.toLowerCase()),
      );
      if (
        pane &&
        hasExplicitHookStatus(agent) &&
        cliSet.has(pane.currentCommand.toLowerCase())
      ) {
        continue;
      }
      agent.status = "detached";
      agent.detachedAt = new Date().toISOString();
      agent.paneId = null;
      agent.confidence = "none";
      changed = true;
    }
  }

  if (changed) {
    saveWorkspace(ws);
  }
}
