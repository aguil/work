import { evaluateMatch } from "../adapters/evaluate.js";
import { resolveManifestForCli } from "../adapters/loader.js";
import { buildObservationContext, regionText } from "../adapters/regions.js";
import { getConfigValue } from "../config/store.js";
import type { TmuxPane } from "../tmux/client.js";

export interface DetectedAgent {
  paneId: string;
  cli: string;
  paneTitle: string;
  currentPath: string;
  windowIndex: number;
  paneIndex: number;
  sessionName: string;
}

const CURSOR_AGENT_TITLE = /\bAgent\s+-/;
const ACTIVE_AGENT_TITLE = /working|⏳|[\u2800-\u28FF]/i;

function isActiveAgentTitle(title: string): boolean {
  return ACTIVE_AGENT_TITLE.test(title);
}

/** True when pane scrollback shows Cursor agent UI, not a stale restored title. */
function hasAgentScreenEvidence(pane: TmuxPane, cli: string): boolean {
  const manifest = resolveManifestForCli(cli);
  if (!manifest) return false;

  const ctx = buildObservationContext(pane);
  for (const rule of manifest.rules) {
    const region = rule.match.region ?? "bottom_lines";
    if (region === "pane_title") continue;
    const lines = rule.match.lines ?? 5;
    const text = regionText(ctx, region, lines);
    if (evaluateMatch(text, rule.match)) return true;
  }
  return false;
}

function resolveAgentCli(pane: TmuxPane, cliSet: Set<string>): string | null {
  const cmd = pane.currentCommand.toLowerCase();
  const registeredCli = pane.workAgentCli ?? "agent";
  const registeredLabel = pane.workAgentLabel;

  if (cliSet.has(cmd)) {
    if (!registeredLabel) return pane.currentCommand;
    if (
      isActiveAgentTitle(pane.title) ||
      hasAgentScreenEvidence(pane, registeredCli)
    ) {
      return registeredCli;
    }
    return null;
  }

  if (registeredLabel) {
    if (
      isActiveAgentTitle(pane.title) ||
      hasAgentScreenEvidence(pane, registeredCli)
    ) {
      return registeredCli;
    }
    return null;
  }

  if (!CURSOR_AGENT_TITLE.test(pane.title)) return null;

  if (isActiveAgentTitle(pane.title)) return "agent";
  if (hasAgentScreenEvidence(pane, "agent")) return "agent";
  return null;
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

    const cli = resolveAgentCli(pane, cliSet);
    if (!cli) continue;

    detected.push({
      paneId: pane.id,
      cli,
      paneTitle: pane.title,
      currentPath: pane.currentPath,
      windowIndex: pane.windowIndex,
      paneIndex: pane.index,
      sessionName: pane.sessionName,
    });
  }

  return detected;
}

export function isSidebarPane(pane: TmuxPane): boolean {
  return pane.workSidebar;
}

export function detectSinglePane(pane: TmuxPane): DetectedAgent | null {
  const agentClis = getConfigValue("agent-clis");
  const cliSet = new Set(agentClis.map((c) => c.toLowerCase()));
  const cli = resolveAgentCli(pane, cliSet);
  if (!cli) return null;

  return {
    paneId: pane.id,
    cli,
    paneTitle: pane.title,
    currentPath: pane.currentPath,
    windowIndex: pane.windowIndex,
    paneIndex: pane.index,
    sessionName: pane.sessionName,
  };
}
