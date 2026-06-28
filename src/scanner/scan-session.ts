import * as tmux from "../tmux/client.js";
import { detectAgents } from "./detect.js";
import {
  findWorkspaceBySession,
  saveWorkspace,
  upsertAgent,
  findAgentByPane,
  autoLabel,
} from "../workspace/state.js";

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
    const existing = findAgentByPane(ws, d.paneId);
    if (existing) continue;

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

    tmux.setOption("pane", "@workctl-agent-label", label, d.paneId);
    tmux.setOption("pane", "@workctl-agent-cli", d.cli, d.paneId);

    if (!opts?.quiet) {
      console.log(`${ws.name}: found ${d.cli} → ${label} (${d.paneId})`);
    }
    totalNew++;
  }

  if (totalNew > 0) saveWorkspace(ws);
  return totalNew;
}
