import { execFileSync } from "node:child_process";
import { isActiveAgentTitle } from "../adapters/agent-title.js";
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

const agentProcessCache = new Map<string, boolean>();

function agentProcessCacheKey(pane: TmuxPane, cli: string): string {
  return `${pane.pid}:${cli}`;
}

function processNamesForDetection(cli: string): string[] {
  const manifest = resolveManifestForCli(cli);
  if (manifest) return manifest.processNames;
  return agentProcessNames(cli);
}

function processArgsMatchNames(pid: number, names: string[]): boolean {
  try {
    const args = execFileSync("ps", ["-p", String(pid), "-o", "args="], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .trim()
      .toLowerCase();
    for (const name of names) {
      if (args.includes(name)) return true;
    }
  } catch {
    // process exited
  }
  return false;
}

/** True when the pane or a descendant process is an agent CLI. */
function hasAgentChildProcessUncached(pane: TmuxPane, cli: string): boolean {
  const names = processNamesForDetection(cli);
  if (names.length === 0 || pane.pid <= 0) return false;

  if (processArgsMatchNames(pane.pid, names)) return true;

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
        const pid = Number.parseInt(childPid, 10);
        if (processArgsMatchNames(pid, names)) return true;
        queue.push(pid);
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

function processArgsMatchAnyCli(
  pid: number,
  namesByCli: Map<string, string[]>,
): string | null {
  try {
    const args = execFileSync("ps", ["-p", String(pid), "-o", "args="], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .trim()
      .toLowerCase();
    for (const [cli, names] of namesByCli) {
      for (const name of names) {
        if (args.includes(name)) return cli;
      }
    }
  } catch {
    // process exited
  }
  return null;
}

/** One process-tree walk; returns the first configured agent CLI found. */
function findAgentCliByProcessTree(
  pane: TmuxPane,
  cliSet: Set<string>,
): string | null {
  if (pane.pid <= 0) return null;

  const namesByCli = new Map<string, string[]>();
  for (const cli of cliSet) {
    namesByCli.set(cli, processNamesForDetection(cli));
  }

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

      const matchedCli = processArgsMatchAnyCli(parentPid, namesByCli);
      if (matchedCli) {
        agentProcessCache.set(agentProcessCacheKey(pane, matchedCli), true);
        return matchedCli;
      }

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
        queue.push(Number.parseInt(childPid, 10));
      }
    }
  }

  return null;
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

  // Registered panes stay agents while the CLI process is live, or while tmux
  // still reports an agent CLI as the foreground command (typing redraws).
  if (registeredLabel) {
    if (pane.workAgentCli) {
      const registeredCli = pane.workAgentCli.toLowerCase();
      if (
        hasAgentChildProcess(pane, pane.workAgentCli) ||
        (cliSet.has(cmd) && cmd === registeredCli)
      ) {
        return pane.workAgentCli;
      }
      return null;
    }
    if (cliSet.has(cmd)) return cmd;
    const childCli = findAgentCliByProcessTree(pane, cliSet);
    if (childCli) return childCli;
    return null;
  }

  if (cliSet.has(cmd)) {
    return trackedCli;
  }

  if (!CURSOR_AGENT_TITLE.test(pane.title)) return null;

  if (!hasAgentChildProcess(pane, "agent")) return null;

  if (isActiveAgentTitle(pane.title)) return "agent";
  if (hasAgentScreenEvidence(pane, "agent")) return "agent";
  return null;
}

/** Whether a tracked pane still runs an agent CLI (pane root or descendant). */
export function paneHostsAgentProcess(pane: TmuxPane, cli: string): boolean {
  return hasAgentChildProcess(pane, cli);
}

/** Workspace sync: pane still bound to an agent CLI (process tree or foreground cmd). */
export function paneStillHostsAgent(
  pane: TmuxPane,
  cli: string,
  cliSet?: ReadonlySet<string>,
): boolean {
  if (hasAgentChildProcess(pane, cli)) return true;
  if (!cliSet) return false;

  const cmd = pane.currentCommand.toLowerCase();
  if (pane.workAgentLabel && cliSet.has(cmd) && cmd === cli.toLowerCase()) {
    return true;
  }

  return false;
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
