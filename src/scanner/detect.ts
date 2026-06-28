import type { TmuxPane } from "../tmux/client.js";
import { getConfigValue } from "../config/store.js";

export interface DetectedAgent {
  paneId: string;
  cli: string;
  paneTitle: string;
  currentPath: string;
  windowIndex: number;
  paneIndex: number;
  sessionName: string;
}

export function detectAgents(
  panes: TmuxPane[],
  excludePaneIds?: Set<string>,
): DetectedAgent[] {
  const agentClis = getConfigValue("agent-clis");
  const cliSet = new Set(agentClis.map((c) => c.toLowerCase()));
  const detected: DetectedAgent[] = [];

  for (const pane of panes) {
    if (excludePaneIds?.has(pane.id)) continue;

    const cmd = pane.currentCommand.toLowerCase();
    if (cliSet.has(cmd)) {
      detected.push({
        paneId: pane.id,
        cli: pane.currentCommand,
        paneTitle: pane.title,
        currentPath: pane.currentPath,
        windowIndex: pane.windowIndex,
        paneIndex: pane.index,
        sessionName: pane.sessionName,
      });
    }
  }

  return detected;
}

export function isSidebarPane(pane: TmuxPane): boolean {
  return pane.currentCommand === "workctl" && pane.title.includes("sidebar");
}

export function detectSinglePane(pane: TmuxPane): DetectedAgent | null {
  const agentClis = getConfigValue("agent-clis");
  const cliSet = new Set(agentClis.map((c) => c.toLowerCase()));
  const cmd = pane.currentCommand.toLowerCase();

  if (!cliSet.has(cmd)) return null;

  return {
    paneId: pane.id,
    cli: pane.currentCommand,
    paneTitle: pane.title,
    currentPath: pane.currentPath,
    windowIndex: pane.windowIndex,
    paneIndex: pane.index,
    sessionName: pane.sessionName,
  };
}
