import {
  clearScreenMetadata,
  hasExplicitHookStatus,
} from "../adapters/debounce.js";
import {
  applyPaneObservation,
  observeAgents,
  type PaneObservation,
} from "../adapters/update-agent.js";
import { getConfigValue } from "../config/store.js";
import {
  clearAgentProcessCache,
  detectAgents,
  detectSinglePane,
  isSidebarPane,
  paneStillHostsAgent,
} from "../scanner/detect.js";
import { enrichAgentView } from "../sidebar/enrich.js";
import type { TmuxPane } from "../tmux/client.js";
import * as tmux from "../tmux/client.js";
import { enrichTree, type TreeView } from "../vcs/detect.js";
import { resolveWorkspaceForSession } from "../workspace/resolve-session.js";
import {
  type AgentRecord,
  autoLabel,
  findAgentByPane,
  listWorkspaces,
  mutateWorkspace,
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
  const allWorkspaces = listWorkspaces();

  const sidebarPaneIds = new Set(
    allPanes.filter(isSidebarPane).map((p) => p.id),
  );
  const paneById = new Map(allPanes.map((p) => [p.id, p]));

  clearAgentProcessCache();

  const sessions: SessionSnapshot[] = [];

  for (const session of tmuxSessions) {
    const ws = resolveWorkspaceForSession(session.name, allWorkspaces, {
      sessionListed: true,
    });
    const sessionPanes = allPanes.filter((p) => p.sessionName === session.name);
    const detected = detectAgents(sessionPanes, sidebarPaneIds, {
      preserveCache: true,
    });

    let agents: SessionSnapshot["agents"] = [];

    if (ws) {
      const poll = readWorkspacePoll(ws, detected, paneById);
      const { state, paneOptions } = applyWorkspacePoll(ws.name, poll);
      for (const { paneId, name, value } of paneOptions) {
        tmux.setOption("pane", name, value, paneId);
      }
      agents = Object.values((state ?? ws).agents).map((a) =>
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

/** What one poll read for a workspace, before taking its lock. */
export interface WorkspacePoll {
  detected: ReturnType<typeof detectAgents>;
  paneById: Map<string, TmuxPane>;
  probes: Map<string, PaneProbe>;
  observations: Map<string, PaneObservation>;
  /** Each agent's `lastSeen` at the read, by label, before anything moved it. */
  lastSeenAtRead: Map<string, string>;
}

/** Whether an undetected agent's pane still hosts one, read outside the lock. */
export interface PaneProbe {
  hostsAgent: boolean;
  detected: boolean;
}

interface PaneOption {
  paneId: string;
  name: string;
  value: string;
}

function probeKey(agent: AgentRecord): string {
  return `${agent.label}\0${agent.paneId}`;
}

function probeUndetectedAgents(
  ws: WorkspaceState,
  detected: ReturnType<typeof detectAgents>,
  paneById: Map<string, TmuxPane>,
): Map<string, PaneProbe> {
  const detectedPaneIds = new Set(detected.map((d) => d.paneId));
  const agentCliSet = new Set(
    getConfigValue("agent-clis").map((c) => c.toLowerCase()),
  );
  const probes = new Map<string, PaneProbe>();
  for (const agent of Object.values(ws.agents)) {
    if (!agent.paneId || detectedPaneIds.has(agent.paneId)) continue;
    const pane = paneById.get(agent.paneId);
    // Sync detaches this agent without reading its pane.
    if (pane && !pane.workAgentLabel && !hasExplicitHookStatus(agent)) continue;
    const hostsAgent = pane
      ? paneStillHostsAgent(pane, agent.cli, agentCliSet)
      : false;
    probes.set(probeKey(agent), {
      hostsAgent,
      detected:
        pane && !hostsAgent
          ? detectSinglePane(pane, { preserveCache: true }) != null
          : false,
    });
  }
  return probes;
}

/**
 * All of a poll's tmux reads. `ws` is an unlocked snapshot: syncing it only
 * decides which panes to observe, and nothing in it is ever saved.
 */
export function readWorkspacePoll(
  ws: WorkspaceState,
  detected: ReturnType<typeof detectAgents>,
  paneById: Map<string, TmuxPane>,
): WorkspacePoll {
  const lastSeenAtRead = new Map(
    Object.values(ws.agents).map((a) => [a.label, a.lastSeen]),
  );
  const probes = probeUndetectedAgents(ws, detected, paneById);
  syncAgentsToWorkspace(ws, detected, paneById, probes);
  return {
    detected,
    paneById,
    probes,
    lastSeenAtRead,
    observations: observeAgents(Object.values(ws.agents), paneById),
  };
}

/**
 * Re-applies a poll to the workspace as it is now, so a hook that landed since
 * the poll's read is kept. No tmux call happens under the lock: the pane
 * options come back for the caller to write afterwards.
 */
export function applyWorkspacePoll(
  workspaceName: string,
  poll: WorkspacePoll,
): { state: WorkspaceState | null; paneOptions: PaneOption[] } {
  let paneOptions: PaneOption[] = [];
  const state = mutateWorkspace(workspaceName, (fresh) => {
    // Read ahead of sync, which moves `lastSeen` itself. A difference means
    // the record changed after the read, so that read is older than the record:
    // an idle capture must not override the hook that followed it (JC-24).
    const movedSinceRead = new Set(
      Object.values(fresh.agents)
        .filter((a) => a.lastSeen !== poll.lastSeenAtRead.get(a.label))
        .map((a) => a.label),
    );
    const sync = syncAgentsToWorkspace(
      fresh,
      poll.detected,
      poll.paneById,
      poll.probes,
    );
    paneOptions = sync.paneOptions;
    let changed = sync.changed;
    for (const agent of Object.values(fresh.agents)) {
      if (movedSinceRead.has(agent.label)) continue;
      const observation = agent.paneId
        ? poll.observations.get(agent.paneId)
        : undefined;
      if (observation && applyPaneObservation(agent, observation)) {
        changed = true;
      }
    }
    return changed;
  });
  return { state, paneOptions };
}

function paneOptionsFor(
  pane: TmuxPane,
  agent: Pick<AgentRecord, "label" | "cli">,
): PaneOption[] {
  const options: PaneOption[] = [];
  if (pane.workAgentLabel !== agent.label) {
    options.push({
      paneId: pane.id,
      name: "@work-agent-label",
      value: agent.label,
    });
  }
  if (pane.workAgentCli !== agent.cli) {
    options.push({
      paneId: pane.id,
      name: "@work-agent-cli",
      value: agent.cli,
    });
  }
  return options;
}

function syncAgentsToWorkspace(
  ws: WorkspaceState,
  detected: ReturnType<typeof detectAgents>,
  paneById: Map<string, TmuxPane>,
  probes: Map<string, PaneProbe>,
): { changed: boolean; paneOptions: PaneOption[] } {
  const detectedPaneIds = new Set(detected.map((d) => d.paneId));
  const paneOptions: PaneOption[] = [];
  let changed = false;

  for (const d of detected) {
    const existing = findAgentByPane(ws, d.paneId);
    if (existing) {
      const pane = paneById.get(d.paneId);
      if (pane) paneOptions.push(...paneOptionsFor(pane, existing));
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
        const pane = paneById.get(d.paneId);
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
        const pane = paneById.get(d.paneId);
        if (pane) {
          paneOptions.push(
            { paneId: pane.id, name: "@work-agent-label", value: label },
            { paneId: pane.id, name: "@work-agent-cli", value: d.cli },
          );
        }
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
      const pane = paneById.get(agent.paneId);
      if (!pane?.workAgentLabel && !hasExplicitHookStatus(agent)) {
        agent.status = "detached";
        agent.detachedAt = new Date().toISOString();
        agent.paneId = null;
        agent.confidence = "none";
        clearScreenMetadata(agent);
        changed = true;
        continue;
      }
      // A record a hook created or moved since the poll's read was never
      // probed. Nothing says its pane is gone, so the next poll decides.
      const probe = probes.get(probeKey(agent));
      if (!probe) continue;
      if (
        pane &&
        (probe.hostsAgent || (hasExplicitHookStatus(agent) && probe.detected))
      ) {
        paneOptions.push(...paneOptionsFor(pane, agent));
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

  return { changed, paneOptions };
}
