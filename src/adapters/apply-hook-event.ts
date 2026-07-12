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
        hookPaneResolveOptions(paneCtx),
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

  const allWorkspaces = listWorkspaces();
  const paneResolveOpts = hookPaneResolveOptions(paneCtx);

  if (conversationId) {
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
    return {
      applied: false,
      workspace: null,
      label: null,
      status: null,
      conversationId,
      paneId,
      event,
    };
  }

  const workspaces = allWorkspaces.filter((w) => !w.archived);
  let target: { ws: WorkspaceState; agent: AgentRecord } | null = null;

  if (paneId && paneCtx.sessionName) {
    const ws = resolveWorkspaceForSession(
      paneCtx.sessionName,
      allWorkspaces,
      paneResolveOpts,
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
      const ws = resolveWorkspaceForSession(
        binding.sessionName,
        allWorkspaces,
        paneResolveOpts,
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
    const ws = resolveWorkspaceForSession(
      paneCtx.sessionName,
      allWorkspaces,
      paneResolveOpts,
    );
    if (ws) {
      const agent = ensureAgentForPane(ws, paneId);
      target = { ws, agent };
    }
  }

  if (!target) {
    return {
      applied: false,
      workspace: null,
      label: null,
      status,
      conversationId,
      paneId,
      event,
    };
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
    return {
      applied: false,
      workspace: ws.name,
      label: agent.label,
      status,
      conversationId,
      paneId,
      event,
    };
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
    saveWorkspace(ws);
    return {
      applied: true,
      workspace: ws.name,
      label: agent.label,
      status: agent.status,
      conversationId,
      paneId: agent.paneId,
      event,
    };
  }

  const changed = applyHookStatus(agent, status, event);
  if (changed || conversationId) {
    saveWorkspace(ws);
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

  return {
    applied: true,
    workspace: ws.name,
    label: agent.label,
    status: agent.status,
    conversationId,
    paneId: agent.paneId,
    event,
  };
}
