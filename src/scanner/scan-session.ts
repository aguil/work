import { getBindingByPane } from "../adapters/conversation-map.js";
import {
  applyObservation,
  hasExplicitHookStatus,
} from "../adapters/debounce.js";
import { observePane } from "../adapters/observe.js";
import * as tmux from "../tmux/client.js";
import {
  type AgentRecord,
  autoLabel,
  findAgentByPane,
  findWorkspaceBySession,
  saveWorkspace,
  upsertAgent,
} from "../workspace/state.js";
import type { DetectedAgent } from "./detect.js";
import { detectAgents, detectSinglePane, isSidebarPane } from "./detect.js";

function registerDetectedAgent(
  ws: ReturnType<typeof findWorkspaceBySession>,
  detected: DetectedAgent,
  pane: ReturnType<typeof tmux.getPane>,
  opts?: { quiet?: boolean },
): number {
  if (!ws) return 0;

  const existing = findAgentByPane(ws, detected.paneId);
  if (existing) {
    const binding = getBindingByPane(detected.paneId);
    if (binding && existing.conversationId !== binding.conversationId) {
      existing.conversationId = binding.conversationId;
      saveWorkspace(ws);
    }
    if (pane && !hasExplicitHookStatus(existing)) {
      const observed = observePane(pane, detected.cli);
      if (observed && applyObservation(existing, observed)) {
        saveWorkspace(ws);
      }
    }
    const currentLabel = tmux.getOption(
      "pane",
      "@work-agent-label",
      detected.paneId,
    );
    if (currentLabel !== existing.label) {
      tmux.setOption(
        "pane",
        "@work-agent-label",
        existing.label,
        detected.paneId,
      );
    }
    return 0;
  }

  const label = autoLabel(detected.cli, ws);
  const record: AgentRecord = {
    label,
    cli: detected.cli,
    paneId: detected.paneId,
    status: "unknown",
    confidence: "none",
    detachedAt: null,
    lastSeen: new Date().toISOString(),
  };

  if (pane) {
    const observed = observePane(pane, detected.cli);
    if (observed) applyObservation(record, observed);
  }

  const binding = getBindingByPane(detected.paneId);
  if (binding) {
    record.conversationId = binding.conversationId;
  }

  upsertAgent(ws, record);

  tmux.setOption("pane", "@work-agent-label", label, detected.paneId);
  tmux.setOption("pane", "@work-agent-cli", detected.cli, detected.paneId);

  if (!opts?.quiet) {
    console.log(
      `${ws.name}: found ${detected.cli} → ${label} (${detected.paneId})`,
    );
  }

  saveWorkspace(ws);
  return 1;
}

export function scanPane(paneId: string, opts?: { quiet?: boolean }): number {
  const pane = tmux.getPane(paneId);
  if (!pane || isSidebarPane(pane)) return 0;

  const detected = detectSinglePane(pane);
  if (!detected) return 0;

  const ws = findWorkspaceBySession(pane.sessionName);
  if (!ws) {
    if (!opts?.quiet) {
      console.log(
        `[untracked] ${pane.sessionName}: ${detected.cli} in ${detected.paneId}`,
      );
    }
    return 0;
  }

  return registerDetectedAgent(ws, detected, pane, opts);
}

export function scanSession(
  sessionName: string,
  opts?: { quiet?: boolean },
): number {
  const panes = tmux.listPanes(sessionName);
  const sidebarPaneIds = new Set(panes.filter(isSidebarPane).map((p) => p.id));
  const detected = detectAgents(panes, sidebarPaneIds);
  if (detected.length === 0) return 0;

  const ws = findWorkspaceBySession(sessionName);
  if (!ws) {
    if (!opts?.quiet) {
      for (const d of detected) {
        console.log(`[untracked] ${sessionName}: ${d.cli} in ${d.paneId}`);
      }
    }
    return 0;
  }

  let totalNew = 0;

  const paneById = new Map(panes.map((p) => [p.id, p]));

  for (const d of detected) {
    totalNew += registerDetectedAgent(
      ws,
      d,
      paneById.get(d.paneId) ?? null,
      opts,
    );
  }

  return totalNew;
}
