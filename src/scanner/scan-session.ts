import * as tmux from "../tmux/client.js";
import { detectAgents, detectSinglePane } from "./detect.js";
import {
  findWorkspaceBySession,
  saveWorkspace,
  upsertAgent,
  findAgentByPane,
  autoLabel,
} from "../workspace/state.js";

function registerDetectedAgent(
  ws: ReturnType<typeof findWorkspaceBySession>,
  detected: NonNullable<ReturnType<typeof detectSinglePane>>,
  opts?: { quiet?: boolean },
): number {
  if (!ws) return 0;

  const existing = findAgentByPane(ws, detected.paneId);
  if (existing) return 0;

  const label = autoLabel(detected.cli, ws);
  upsertAgent(ws, {
    label,
    cli: detected.cli,
    paneId: detected.paneId,
    status: "unknown",
    confidence: "none",
    detachedAt: null,
    lastSeen: new Date().toISOString(),
  });

  tmux.setOption("pane", "@workctl-agent-label", label, detected.paneId);
  tmux.setOption("pane", "@workctl-agent-cli", detected.cli, detected.paneId);

  if (!opts?.quiet) {
    console.log(`${ws.name}: found ${detected.cli} → ${label} (${detected.paneId})`);
  }

  saveWorkspace(ws);
  return 1;
}

export function scanPane(
  paneId: string,
  opts?: { quiet?: boolean },
): number {
  const pane = tmux.getPane(paneId);
  if (!pane) return 0;

  const detected = detectSinglePane(pane);
  if (!detected) return 0;

  const ws = findWorkspaceBySession(pane.sessionName);
  if (!ws) {
    if (!opts?.quiet) {
      console.log(`[untracked] ${pane.sessionName}: ${detected.cli} in ${detected.paneId}`);
    }
    return 0;
  }

  return registerDetectedAgent(ws, detected, opts);
}

export function scanSession(
  sessionName: string,
  opts?: { quiet?: boolean },
): number {
  const panes = tmux.listPanes(sessionName);
  const detected = detectAgents(panes);
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

  for (const d of detected) {
    totalNew += registerDetectedAgent(ws, d, opts);
  }

  return totalNew;
}
