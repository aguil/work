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
  loadWorkspace,
  loadWorkspacesForSession,
  mutateWorkspace,
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

interface HookTarget {
  workspaceName: string;
  agentLabel: string | null;
  createAgent: boolean;
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

function hookBindResolveOptions(
  paneCtx: HookPaneContext,
): ResolveSessionOptions {
  return {
    sessionListed: paneCtx.pane != null,
  };
}

function listActiveWorkspaces(): WorkspaceState[] {
  return listWorkspaces().filter((w) => !w.archived);
}

function resolveWorkspaceForHook(
  sessionName: string,
  options: ResolveSessionOptions,
  pendingUnarchiveSaves: Set<string>,
): WorkspaceState | null {
  const before = loadWorkspacesForSession(sessionName);
  const ws = resolveWorkspaceForSession(sessionName, undefined, options);
  if (
    ws &&
    before.archived &&
    !ws.archived &&
    options.persistUnarchive === false
  ) {
    pendingUnarchiveSaves.add(ws.name);
  }
  return ws;
}

function flushPendingUnarchiveSaves(
  pendingUnarchiveSaves: Set<string>,
  exceptName?: string,
): void {
  for (const name of pendingUnarchiveSaves) {
    if (name === exceptName) continue;
    mutateWorkspace(name, (ws) => {
      if (!ws.archived) return false;
      ws.archived = false;
      return true;
    });
  }
  if (exceptName) {
    pendingUnarchiveSaves.delete(exceptName);
  } else {
    pendingUnarchiveSaves.clear();
  }
}

function exitHook(
  result: HookEventResult,
  pendingUnarchiveSaves: Set<string>,
  savedWorkspaceName?: string,
): HookEventResult {
  flushPendingUnarchiveSaves(pendingUnarchiveSaves, savedWorkspaceName);
  return result;
}

function bindConversation(
  conversationId: string,
  paneId: string | null,
  cwd: string | null,
  paneCtx: HookPaneContext,
): void {
  const ws = paneCtx.sessionName
    ? resolveWorkspaceForSession(
        paneCtx.sessionName,
        undefined,
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

function findHookTarget(
  paneId: string | null,
  paneCtx: HookPaneContext,
  conversationId: string | null,
  paneResolveOpts: ResolveSessionOptions,
  pendingUnarchiveSaves: Set<string>,
): HookTarget | null {
  if (paneId && paneCtx.sessionName) {
    const ws = resolveWorkspaceForHook(
      paneCtx.sessionName,
      paneResolveOpts,
      pendingUnarchiveSaves,
    );
    if (ws) {
      const agent = findAgentByPane(ws, paneId);
      if (agent) {
        return {
          workspaceName: ws.name,
          agentLabel: agent.label,
          createAgent: false,
        };
      }
    }
    for (const other of listActiveWorkspaces()) {
      const agent = findAgentByPane(other, paneId);
      if (agent) {
        return {
          workspaceName: other.name,
          agentLabel: agent.label,
          createAgent: false,
        };
      }
    }
  }

  if (conversationId) {
    const binding = getConversationBinding(conversationId);
    if (binding?.workspaceName) {
      const ws = loadWorkspace(binding.workspaceName);
      if (ws && !ws.archived) {
        const agent = findAgentByConversation(ws, conversationId);
        if (agent) {
          return {
            workspaceName: ws.name,
            agentLabel: agent.label,
            createAgent: false,
          };
        }
      }
    }
    if (binding?.sessionName) {
      const ws = resolveWorkspaceForHook(
        binding.sessionName,
        hookBindingResolveOptions,
        pendingUnarchiveSaves,
      );
      if (ws) {
        const agent = findAgentByConversation(ws, conversationId);
        if (agent) {
          return {
            workspaceName: ws.name,
            agentLabel: agent.label,
            createAgent: false,
          };
        }
      }
    }
    for (const ws of listActiveWorkspaces()) {
      const agent = findAgentByConversation(ws, conversationId);
      if (agent) {
        return {
          workspaceName: ws.name,
          agentLabel: agent.label,
          createAgent: false,
        };
      }
    }
    if (binding?.paneId) {
      for (const ws of listActiveWorkspaces()) {
        const agent = findAgentByPane(ws, binding.paneId);
        if (agent) {
          return {
            workspaceName: ws.name,
            agentLabel: agent.label,
            createAgent: false,
          };
        }
      }
    }
  }

  if (paneId && paneCtx.sessionName) {
    const ws = resolveWorkspaceForHook(
      paneCtx.sessionName,
      paneResolveOpts,
      pendingUnarchiveSaves,
    );
    if (ws) {
      return { workspaceName: ws.name, agentLabel: null, createAgent: true };
    }
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

export function applyHookEvent(
  input: AgentHookInput,
  opts?: { paneId?: string; statusOverride?: AgentStatus },
): HookEventResult {
  const event = resolveHookEventName(input);
  const conversationId = resolveConversationId(input);
  const paneId = resolvePaneId(opts?.paneId);
  const cwd =
    typeof input.cwd === "string"
      ? input.cwd
      : Array.isArray(input.workspace_roots) &&
          typeof input.workspace_roots[0] === "string"
        ? input.workspace_roots[0]
        : null;

  const status = opts?.statusOverride ?? mapHookEventToStatus(event, input);
  const pendingUnarchiveSaves = new Set<string>();

  if (!conversationId && status == null) {
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

  const paneCtx = resolveHookPaneContext(paneId);
  const paneResolveOpts = hookPaneResolveOptions(paneCtx);

  if (conversationId) {
    bindConversation(conversationId, paneId, cwd, paneCtx);
  }

  if (
    event === "sessionEnd" &&
    conversationId &&
    !isTransientSessionEnd(input)
  ) {
    removeConversationBinding(conversationId);
  }

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
      pendingUnarchiveSaves,
    );
  }

  const target = findHookTarget(
    paneId,
    paneCtx,
    conversationId,
    paneResolveOpts,
    pendingUnarchiveSaves,
  );

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
      pendingUnarchiveSaves,
    );
  }

  let result: HookEventResult = {
    applied: false,
    workspace: target.workspaceName,
    label: target.agentLabel,
    status,
    conversationId,
    paneId,
    event,
  };
  let boundSessionName = paneCtx.sessionName;

  mutateWorkspace(target.workspaceName, (ws) => {
    boundSessionName = ws.sessionName;
    let agent: AgentRecord | undefined;
    if (target.createAgent && paneId) {
      agent = ensureAgentForPane(ws, paneId);
    } else if (target.agentLabel) {
      agent = ws.agents[target.agentLabel];
    } else if (paneId) {
      agent = findAgentByPane(ws, paneId);
    }
    if (!agent) return false;

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
      result = {
        applied: false,
        workspace: ws.name,
        label: agent.label,
        status,
        conversationId,
        paneId,
        event,
      };
      return false;
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
      result = {
        applied: true,
        workspace: ws.name,
        label: agent.label,
        status: agent.status,
        conversationId,
        paneId: agent.paneId,
        event,
      };
      return true;
    }

    const changed = applyHookStatus(agent, status, event);
    result = {
      applied: true,
      workspace: ws.name,
      label: agent.label,
      status: agent.status,
      conversationId,
      paneId: agent.paneId,
      event,
    };
    return changed || conversationId != null;
  });

  if (conversationId && paneId && result.applied) {
    upsertConversationBinding({
      conversationId,
      paneId,
      sessionName: boundSessionName,
      workspaceName: result.workspace,
      cwd,
    });
  }

  return exitHook(
    result,
    pendingUnarchiveSaves,
    result.applied ? (result.workspace ?? undefined) : undefined,
  );
}
