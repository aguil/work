import {
  clearScreenMetadata,
  hasExplicitHookStatus,
} from "../adapters/debounce.js";
import { observeAgentsInWorkspace } from "../adapters/update-agent.js";
import { detectAgents, isSidebarPane } from "../scanner/detect.js";
import { enrichAgentView } from "../sidebar/enrich.js";
import * as tmux from "../tmux/client.js";
import { enrichTree, type TreeView } from "../vcs/detect.js";
import {
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

const TREE_REFRESH_MS = 30_000;
const TREE_REFRESHES_PER_POLL = 1;
let treeRefreshesThisPoll = 0;

type TreeCacheEntry = {
  source: WorkspaceState["trees"][number];
  view: TreeView;
  refreshedAt: number;
};

const treeCache = new Map<string, TreeCacheEntry>();

function treeCacheKey(
  workspaceName: string,
  tree: WorkspaceState["trees"][number],
): string {
  return `${workspaceName}\0${tree.path}`;
}

function sameTreeSource(
  a: WorkspaceState["trees"][number],
  b: WorkspaceState["trees"][number],
): boolean {
  return (
    a.path === b.path &&
    a.vcsType === b.vcsType &&
    a.branch === b.branch &&
    a.createdByWork === b.createdByWork
  );
}

function enrichTreesCached(ws: WorkspaceState, now: number): TreeView[] {
  const liveKeys = new Set<string>();
  const views: TreeView[] = [];

  for (const tree of ws.trees) {
    const key = treeCacheKey(ws.name, tree);
    liveKeys.add(key);
    const cached = treeCache.get(key);
    if (
      cached &&
      now - cached.refreshedAt < TREE_REFRESH_MS &&
      sameTreeSource(cached.source, tree)
    ) {
      views.push(cached.view);
      continue;
    }

    if (treeRefreshesThisPoll >= TREE_REFRESHES_PER_POLL) {
      views.push(cached?.view ?? fallbackTreeView(tree));
      continue;
    }

    const view = enrichTree(tree);
    treeRefreshesThisPoll++;
    treeCache.set(key, { source: { ...tree }, view, refreshedAt: now });
    views.push(view);
  }

  for (const key of treeCache.keys()) {
    if (key.startsWith(`${ws.name}\0`) && !liveKeys.has(key)) {
      treeCache.delete(key);
    }
  }

  return views;
}

function fallbackTreeView(tree: WorkspaceState["trees"][number]): TreeView {
  return {
    ...tree,
    dirty: false,
    ahead: null,
    behind: null,
    repoRoot: null,
    revisionKind: null,
    jjChangePrefix: null,
    jjChangeRest: null,
  };
}

export function aggregateState(): AggregatedState {
  const now = Date.now();
  treeRefreshesThisPoll = 0;
  const tmuxSessions = tmux.listSessions();
  const allPanes = tmux.listPanes();
  const workspaces = listWorkspaces().filter((w) => !w.archived);
  const wsMap = new Map(workspaces.map((w) => [w.sessionName, w]));

  const sidebarPaneIds = new Set(
    allPanes.filter(isSidebarPane).map((p) => p.id),
  );
  const paneById = new Map(allPanes.map((p) => [p.id, p]));

  const sessions: SessionSnapshot[] = [];

  for (const session of tmuxSessions) {
    const ws = wsMap.get(session.name);
    const sessionPanes = allPanes.filter((p) => p.sessionName === session.name);
    const detected = detectAgents(sessionPanes, sidebarPaneIds);

    let agents: SessionSnapshot["agents"] = [];

    if (ws) {
      syncAgentsToWorkspace(ws, detected);
      if (observeAgentsInWorkspace(Object.values(ws.agents))) {
        saveWorkspace(ws);
      }
      agents = Object.values(ws.agents).map((a) =>
        enrichAgentView(a, session, paneById),
      );
    } else {
      agents = detected.map((d) =>
        enrichAgentView(
          {
            label: d.cli,
            cli: d.cli,
            paneId: d.paneId,
            status: "unknown",
            confidence: "none",
            detachedAt: null,
            lastSeen: new Date().toISOString(),
          },
          session,
          paneById,
        ),
      );
    }

    sessions.push({
      id: session.id,
      name: session.name,
      index: session.index,
      windowCount: session.windowCount,
      attached: session.attached,
      tracked: ws != null,
      workspaceName: ws?.name ?? null,
      agents,
      trees: ws ? enrichTreesCached(ws, now) : [],
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
      clearScreenMetadata(agent);
      changed = true;
      continue;
    }

    if (
      agent.paneId &&
      agent.status !== "detached" &&
      !detectedPaneIds.has(agent.paneId)
    ) {
      const pane = tmux.getPane(agent.paneId);
      if (pane && hasExplicitHookStatus(agent)) {
        if (pane.workAgentLabel !== agent.label) {
          tmux.setOption("pane", "@work-agent-label", agent.label, pane.id);
        }
        if (pane.workAgentCli !== agent.cli) {
          tmux.setOption("pane", "@work-agent-cli", agent.cli, pane.id);
        }
        continue;
      }
      agent.status = "detached";
      agent.detachedAt = new Date().toISOString();
      agent.paneId = null;
      agent.confidence = "none";
      clearScreenMetadata(agent);
      changed = true;
    }
  }

  if (changed) {
    saveWorkspace(ws);
  }
}
