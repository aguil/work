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
let processTable: ProcessTable | null | undefined;

function agentProcessCacheKey(pane: TmuxPane, cli: string): string {
  return `${pane.pid}:${cli}`;
}

function processNamesForDetection(cli: string): string[] {
  const manifest = resolveManifestForCli(cli);
  if (manifest) return manifest.processNames;
  return agentProcessNames(cli);
}

/** Every process on the host, read once a poll. */
interface ProcessTable {
  args: Map<number, string>;
  children: Map<number, number[]>;
}

// Above execFileSync's 1 MiB default: `-ww` leaves every command line whole.
const PROCESS_TABLE_MAX_BYTES = 64 * 1024 * 1024;

function parseProcessTable(output: string): ProcessTable {
  const table: ProcessTable = { args: new Map(), children: new Map() };
  for (const line of output.split("\n")) {
    const match = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line);
    if (!match) continue;
    const pid = Number(match[1]);
    const ppid = Number(match[2]);
    table.args.set(pid, match[3].toLowerCase());
    const siblings = table.children.get(ppid);
    if (siblings) siblings.push(pid);
    else table.children.set(ppid, [pid]);
  }
  return table;
}

/** Null when `ps` fails, which says nothing about whether any agent has gone. */
function readProcessTable(): ProcessTable | null {
  try {
    const output = execFileSync(
      "ps",
      ["-A", "-ww", "-o", "pid=", "-o", "ppid=", "-o", "args="],
      {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
        maxBuffer: PROCESS_TABLE_MAX_BYTES,
      },
    );
    return parseProcessTable(output);
  } catch {
    return null;
  }
}

function processTableForPoll(): ProcessTable | null {
  if (processTable === undefined) processTable = readProcessTable();
  return processTable;
}

/** Walks a process and its descendants, nearest first, to the first match. */
function findInProcessTree<T>(
  table: ProcessTable,
  rootPid: number,
  match: (args: string) => T | null,
): T | null {
  const queue = [rootPid];
  const seen = new Set<number>();
  for (let i = 0; i < queue.length; i++) {
    const pid = queue[i];
    if (seen.has(pid)) continue;
    seen.add(pid);
    const args = table.args.get(pid);
    const found = args === undefined ? null : match(args);
    if (found !== null) return found;
    queue.push(...(table.children.get(pid) ?? []));
  }
  return null;
}

/** True when the pane or a descendant process is an agent CLI. */
function hasAgentChildProcessUncached(pane: TmuxPane, cli: string): boolean {
  const names = processNamesForDetection(cli);
  if (names.length === 0 || pane.pid <= 0) return false;

  const table = processTableForPoll();
  if (!table) return false;

  return (
    findInProcessTree(table, pane.pid, (args) =>
      names.some((name) => args.includes(name)) ? true : null,
    ) === true
  );
}

function hasAgentChildProcess(pane: TmuxPane, cli: string): boolean {
  const key = agentProcessCacheKey(pane, cli);
  const cached = agentProcessCache.get(key);
  if (cached != null) return cached;

  const live = hasAgentChildProcessUncached(pane, cli);
  agentProcessCache.set(key, live);
  return live;
}

/** One process-tree walk; returns the first configured agent CLI found. */
function findAgentCliByProcessTree(
  pane: TmuxPane,
  cliSet: Set<string>,
): string | null {
  if (pane.pid <= 0) return null;
  const table = processTableForPoll();
  if (!table) return null;

  const namesByCli = new Map<string, string[]>();
  for (const cli of cliSet) {
    namesByCli.set(cli, processNamesForDetection(cli));
  }

  const matchedCli = findInProcessTree(table, pane.pid, (args) => {
    for (const [cli, names] of namesByCli) {
      if (names.some((name) => args.includes(name))) return cli;
    }
    return null;
  });
  if (matchedCli) {
    agentProcessCache.set(agentProcessCacheKey(pane, matchedCli), true);
  }
  return matchedCli;
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

/**
 * For an agent already tracked: a failed read must not detach every agent at
 * once for one poll. Detection stays strict, so it cannot revive or invent one.
 */
function trackedAgentMayBeLive(pane: TmuxPane, cli: string): boolean {
  return hasAgentChildProcess(pane, cli) || processTable === null;
}

/** Whether a tracked pane still runs an agent CLI (pane root or descendant). */
export function paneHostsAgentProcess(pane: TmuxPane, cli: string): boolean {
  return trackedAgentMayBeLive(pane, cli);
}

/** Workspace sync: pane still bound to an agent CLI (process tree or foreground cmd). */
export function paneStillHostsAgent(
  pane: TmuxPane,
  cli: string,
  cliSet?: ReadonlySet<string>,
): boolean {
  if (cliSet) {
    const cmd = pane.currentCommand.toLowerCase();
    if (pane.workAgentLabel && cliSet.has(cmd) && cmd === cli.toLowerCase()) {
      return true;
    }
  }
  return trackedAgentMayBeLive(pane, cli);
}

export function clearAgentProcessCache(): void {
  agentProcessCache.clear();
  processTable = undefined;
}

export function detectAgents(
  panes: TmuxPane[],
  excludePaneIds?: Set<string>,
  opts?: { preserveCache?: boolean },
): DetectedAgent[] {
  if (!opts?.preserveCache) clearAgentProcessCache();
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

export function detectSinglePane(
  pane: TmuxPane,
  opts?: { preserveCache?: boolean },
): DetectedAgent | null {
  if (!opts?.preserveCache) clearAgentProcessCache();
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
