import type { TmuxPane } from "../tmux/client.js";
import * as tmux from "../tmux/client.js";
import type { ResolveSessionOptions } from "../workspace/resolve-session.js";
import { resolveWorkspaceForSession } from "../workspace/resolve-session.js";
import {
  type AgentRecord,
  type AgentStatus,
  autoLabel,
  findAgentByConversation,
  findAgentByPane,
  listWorkspaces,
  saveWorkspace,
  upsertAgent,
  type WorkspaceState,
} from "../workspace/state.js";
import {
  getConversationBinding,
  removeConversationBinding,
  upsertConversationBinding,
} from "./conversation-map.js";
import { applyHookStatus, clearScreenMetadata } from "./debounce.js";
import {
  type AgentHookInput,
  isTransientSessionEnd,
  mapHookEventToStatus,
  resolveConversationId,
  resolveHookEventName,
} from "./hook-events.js";

export interface HookEventResult {
  applied: boolean;
  workspace: string | null;
  label: string | null;
  status: AgentStatus | null;
  conversationId: string | null;
  paneId: string | null;
  event: string;
}

function resolvePaneId(explicitPaneId?: string): string | null {
  if (explicitPaneId) return explicitPaneId;
  if (!process.env.TMUX) return null;
  try {
    const id = tmux.displayMessage("#{pane_id}").trim();
    return id.startsWith("%") ? id : null;
  } catch {
    return null;
  }
}

interface HookPaneContext {
  pane: TmuxPane | null;
  sessionName: string | null;
}

function resolveHookPaneContext(paneId: string | null): HookPaneContext {
  if (!paneId) return { pane: null, sessionName: null };
  const pane = tmux.getPane(paneId);
  return { pane, sessionName: pane?.sessionName ?? null };
}

function findAgentByConversationInWorkspaces(
  workspaces: WorkspaceState[],
  conversationId: string,
): { ws: WorkspaceState; agent: AgentRecord } | null {
  for (const ws of workspaces) {
    const agent = findAgentByConversation(ws, conversationId);
    if (agent) return { ws, agent };
  }
  return null;
}

function ensureAgentForPane(ws: WorkspaceState, paneId: string): AgentRecord {
  const existing = findAgentByPane(ws, paneId);
  if (existing) return existing;

  const record: AgentRecord = {
    label: autoLabel("agent", ws),
    cli: "agent",
    paneId,
    status: "unknown",
    confidence: "none",
    detachedAt: null,
    lastSeen: new Date().toISOString(),
    conversationId: null,
  };
  upsertAgent(ws, record);
  tmux.setOption("pane", "@work-agent-label", record.label, paneId);
  tmux.setOption("pane", "@work-agent-cli", record.cli, paneId);
  return record;
}

function hookPaneResolveOptions(
  paneCtx: HookPaneContext,
): ResolveSessionOptions {
  return {
    sessionListed: paneCtx.pane != null,
    persistUnarchive: false,
  };
}

const hookBindingResolveOptions: ResolveSessionOptions = {
  persistUnarchive: false,
};

function resolveWorkspaceForHook(
  sessionName: string,
  allWorkspaces: WorkspaceState[],
  options: ResolveSessionOptions,
  pendingUnarchiveSaves: Set<string>,
): WorkspaceState | null {
  const wasArchived = allWorkspaces.some(
    (w) => w.archived && w.sessionName === sessionName,
  );
  const ws = resolveWorkspaceForSession(sessionName, allWorkspaces, options);
  if (ws && wasArchived && !ws.archived && options.persistUnarchive === false) {
    pendingUnarchiveSaves.add(ws.name);
  }
  return ws;
}

function flushPendingUnarchiveSaves(
  allWorkspaces: WorkspaceState[],
  pendingUnarchiveSaves: Set<string>,
  exceptName?: string,
): void {
  for (const name of pendingUnarchiveSaves) {
    if (name === exceptName) continue;
    const ws = allWorkspaces.find((w) => w.name === name);
    if (ws) saveWorkspace(ws);
  }
  if (exceptName) {
    pendingUnarchiveSaves.delete(exceptName);
  } else {
    pendingUnarchiveSaves.clear();
  }
}

function saveHookWorkspace(
  ws: WorkspaceState,
  pendingUnarchiveSaves: Set<string>,
): void {
  pendingUnarchiveSaves.delete(ws.name);
  saveWorkspace(ws);
}

function exitHook(
  result: HookEventResult,
  allWorkspaces: WorkspaceState[],
  pendingUnarchiveSaves: Set<string>,
  savedWorkspaceName?: string,
): HookEventResult {
  flushPendingUnarchiveSaves(
    allWorkspaces,
    pendingUnarchiveSaves,
    savedWorkspaceName,
  );
  return result;
}

function hookBindResolveOptions(
  paneCtx: HookPaneContext,
): ResolveSessionOptions {
  return {
    sessionListed: paneCtx.pane != null,
  };
}

function bindConversation(
  conversationId: string,
  paneId: string | null,
  cwd: string | null,
  paneCtx: HookPaneContext,
  allWorkspaces: WorkspaceState[],
): void {
  const ws = paneCtx.sessionName
    ? resolveWorkspaceForSession(
        paneCtx.sessionName,
        allWorkspaces,
        hookBindResolveOptions(paneCtx),
      )
    : null;
  upsertConversationBinding({
    conversationId,
    paneId,
    sessionName: paneCtx.sessionName,
    workspaceName: ws?.name ?? null,
    cwd: cwd ?? null,
  });
}

export function applyHookEvent(
  input: AgentHookInput,
  opts?: { paneId?: string; statusOverride?: AgentStatus },
): HookEventResult {
  const event = resolveHookEventName(input);
  const conversationId = resolveConversationId(input);
  const paneId = resolvePaneId(opts?.paneId);
  const paneCtx = resolveHookPaneContext(paneId);
  const cwd =
    typeof input.cwd === "string"
      ? input.cwd
      : Array.isArray(input.workspace_roots) &&
          typeof input.workspace_roots[0] === "string"
        ? input.workspace_roots[0]
        : null;

  const paneResolveOpts = hookPaneResolveOptions(paneCtx);
  const pendingUnarchiveSaves = new Set<string>();
  let allWorkspaces: WorkspaceState[] | null = null;

  if (conversationId) {
    allWorkspaces = listWorkspaces();
    bindConversation(conversationId, paneId, cwd, paneCtx, allWorkspaces);
  }

  if (
    event === "sessionEnd" &&
    conversationId &&
    !isTransientSessionEnd(input)
  ) {
    removeConversationBinding(conversationId);
  }

  const status = opts?.statusOverride ?? mapHookEventToStatus(event, input);

  if (status == null) {
    return exitHook(
      {
        applied: false,
        workspace: null,
        label: null,
        status: null,
        conversationId,
        paneId,
        event,
      },
      allWorkspaces ?? [],
      pendingUnarchiveSaves,
    );
  }

  allWorkspaces ??= listWorkspaces();

  const workspaces = allWorkspaces.filter((w) => !w.archived);
  let target: { ws: WorkspaceState; agent: AgentRecord } | null = null;

  if (paneId && paneCtx.sessionName) {
    const ws = resolveWorkspaceForHook(
      paneCtx.sessionName,
      allWorkspaces,
      paneResolveOpts,
      pendingUnarchiveSaves,
    );
    if (ws) {
      const agent = findAgentByPane(ws, paneId);
      if (agent) {
        target = { ws, agent };
      }
    }
    if (!target) {
      for (const ws of workspaces) {
        const agent = findAgentByPane(ws, paneId);
        if (agent) {
          target = { ws, agent };
          break;
        }
      }
    }
  }

  if (!target && conversationId) {
    const binding = getConversationBinding(conversationId);
    if (binding?.sessionName) {
      const ws = resolveWorkspaceForHook(
        binding.sessionName,
        allWorkspaces,
        hookBindingResolveOptions,
        pendingUnarchiveSaves,
      );
      if (ws) {
        const agent = findAgentByConversation(ws, conversationId);
        if (agent) target = { ws, agent };
      }
    }
  }

  if (!target && conversationId) {
    target = findAgentByConversationInWorkspaces(workspaces, conversationId);
  }

  if (!target && conversationId) {
    const binding = getConversationBinding(conversationId);
    if (binding?.paneId) {
      for (const ws of workspaces) {
        const agent = findAgentByPane(ws, binding.paneId);
        if (agent) {
          target = { ws, agent };
          break;
        }
      }
    }
  }

  if (!target && paneId && paneCtx.sessionName) {
    const ws = resolveWorkspaceForHook(
      paneCtx.sessionName,
      allWorkspaces,
      paneResolveOpts,
      pendingUnarchiveSaves,
    );
    if (ws) {
      const agent = ensureAgentForPane(ws, paneId);
      target = { ws, agent };
    }
  }

  if (!target) {
    return exitHook(
      {
        applied: false,
        workspace: null,
        label: null,
        status,
        conversationId,
        paneId,
        event,
      },
      allWorkspaces,
      pendingUnarchiveSaves,
    );
  }

  const { ws, agent } = target;

  if (paneId) {
    tmux.setOption("pane", "@work-agent-label", agent.label, paneId);
    tmux.setOption("pane", "@work-agent-cli", agent.cli, paneId);
  }

  if (conversationId) {
    for (const other of Object.values(ws.agents)) {
      if (
        other.label !== agent.label &&
        other.conversationId === conversationId
      ) {
        other.conversationId = null;
      }
    }
    agent.conversationId = conversationId;
  }

  if (paneId && (!agent.paneId || agent.status === "detached")) {
    agent.paneId = paneId;
    agent.detachedAt = null;
    if (agent.status === "detached") {
      agent.status = "unknown";
      agent.confidence = "none";
    }
  }

  if (!agent.paneId && event !== "sessionEnd") {
    return exitHook(
      {
        applied: false,
        workspace: ws.name,
        label: agent.label,
        status,
        conversationId,
        paneId,
        event,
      },
      allWorkspaces,
      pendingUnarchiveSaves,
    );
  }

  if (event === "sessionEnd") {
    agent.status = "detached";
    agent.confidence = "none";
    agent.hookEvent = event;
    agent.pendingIdleCount = 0;
    agent.conversationId = null;
    agent.paneId = null;
    agent.detachedAt = new Date().toISOString();
    agent.lastSeen = new Date().toISOString();
    clearScreenMetadata(agent);
    if (paneId) {
      tmux.unsetOption("pane", "@work-agent-label", paneId);
      tmux.unsetOption("pane", "@work-agent-cli", paneId);
    }
    saveHookWorkspace(ws, pendingUnarchiveSaves);
    return exitHook(
      {
        applied: true,
        workspace: ws.name,
        label: agent.label,
        status: agent.status,
        conversationId,
        paneId: agent.paneId,
        event,
      },
      allWorkspaces,
      pendingUnarchiveSaves,
      ws.name,
    );
  }

  const changed = applyHookStatus(agent, status, event);
  if (changed || conversationId) {
    saveHookWorkspace(ws, pendingUnarchiveSaves);
  }

  if (conversationId && paneId) {
    upsertConversationBinding({
      conversationId,
      paneId,
      sessionName: ws.sessionName,
      workspaceName: ws.name,
      cwd,
    });
  }

  return exitHook(
    {
      applied: true,
      workspace: ws.name,
      label: agent.label,
      status: agent.status,
      conversationId,
      paneId: agent.paneId,
      event,
    },
    allWorkspaces,
    pendingUnarchiveSaves,
    changed || conversationId ? ws.name : undefined,
  );
}
