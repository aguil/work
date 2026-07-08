import { execFileSync } from "node:child_process";
import { evaluateMatch } from "../adapters/evaluate.js";
import {
  agentProcessNames,
  hasHerdrScreenEvidence,
  resolveHerdrBin,
} from "../adapters/herdr.js";
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

const agentProcessCache = new Map<string, boolean>();

function agentProcessCacheKey(pane: TmuxPane, cli: string): string {
  return `${pane.pid}:${cli}`;
}

function processNamesForDetection(cli: string): string[] {
  const manifest = resolveManifestForCli(cli);
  if (manifest) return manifest.processNames;
  return agentProcessNames(cli);
}

/** True when an agent CLI process is running under the pane shell. */
function hasAgentChildProcessUncached(pane: TmuxPane, cli: string): boolean {
  const names = processNamesForDetection(cli);
  if (names.length === 0 || pane.pid <= 0) return false;

  const queue = [pane.pid];
  const seen = new Set<number>();
  let depth = 0;

  while (queue.length > 0 && depth < 4) {
    const levelSize = queue.length;
    depth++;
    for (let i = 0; i < levelSize; i++) {
      const parentPid = queue.shift();
      if (parentPid == null || seen.has(parentPid)) continue;
      seen.add(parentPid);

      let childPids: string[];
      try {
        childPids = execFileSync("pgrep", ["-P", String(parentPid)], {
          encoding: "utf-8",
          stdio: ["ignore", "pipe", "ignore"],
        })
          .trim()
          .split("\n")
          .filter(Boolean);
      } catch {
        continue;
      }

      for (const childPid of childPids) {
        let args = "";
        try {
          args = execFileSync("ps", ["-p", childPid, "-o", "args="], {
            encoding: "utf-8",
            stdio: ["ignore", "pipe", "ignore"],
          })
            .trim()
            .toLowerCase();
        } catch {
          continue;
        }

        for (const name of names) {
          if (args.includes(name)) return true;
        }

        queue.push(parseInt(childPid, 10));
      }
    }
  }

  return false;
}

function hasAgentChildProcess(pane: TmuxPane, cli: string): boolean {
  const key = agentProcessCacheKey(pane, cli);
  const cached = agentProcessCache.get(key);
  if (cached != null) return cached;

  const live = hasAgentChildProcessUncached(pane, cli);
  agentProcessCache.set(key, live);
  return live;
}

/** True when pane scrollback shows agent UI, not a stale restored title. */
function hasAgentScreenEvidence(pane: TmuxPane, cli: string): boolean {
  const manifest = resolveManifestForCli(cli);
  if (manifest) {
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

  if (resolveHerdrBin()) {
    return hasHerdrScreenEvidence(pane, cli);
  }

  return false;
}

function resolveAgentCli(pane: TmuxPane, cliSet: Set<string>): string | null {
  const cmd = pane.currentCommand.toLowerCase();
  const trackedCli = pane.workAgentCli ?? pane.currentCommand;
  const registeredLabel = pane.workAgentLabel;

  if (cliSet.has(cmd)) {
    if (!registeredLabel) return pane.currentCommand;
    if (
      isActiveAgentTitle(pane.title) ||
      hasAgentScreenEvidence(pane, trackedCli)
    ) {
      return trackedCli;
    }
    return null;
  }

  if (registeredLabel) {
    if (!hasAgentChildProcess(pane, trackedCli)) return null;
    if (
      isActiveAgentTitle(pane.title) ||
      hasAgentScreenEvidence(pane, trackedCli)
    ) {
      return trackedCli;
    }
    return null;
  }

  if (!CURSOR_AGENT_TITLE.test(pane.title)) return null;

  if (!hasAgentChildProcess(pane, "agent")) return null;

  if (isActiveAgentTitle(pane.title)) return "agent";
  if (hasAgentScreenEvidence(pane, "agent")) return "agent";
  return null;
}

export function detectAgents(
  panes: TmuxPane[],
  excludePaneIds?: Set<string>,
): DetectedAgent[] {
  agentProcessCache.clear();
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
  agentProcessCache.clear();
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
