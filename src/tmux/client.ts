import { execFileSync } from "node:child_process";
import { getConfigValue } from "../config/store.js";

function tmux(...args: string[]): string {
  try {
    return execFileSync("tmux", args, {
      encoding: "utf-8",
      timeout: 5000,
    }).trimEnd();
  } catch (err: unknown) {
    const e = err as { status?: number; stderr?: string };
    if (e.status === 1 && !e.stderr?.trim()) return "";
    throw err;
  }
}

export function tmuxSessionIndex(sessionId: string): number {
  const match = /^\$(\d+)$/.exec(sessionId);
  return match ? Number.parseInt(match[1], 10) : 0;
}

let cachedTmuxShortcutKeys: string | null | undefined;

/** Clear cached tmux global shortcut alphabet (for tests). */
export function resetSessionShortcutKeysCache(): void {
  cachedTmuxShortcutKeys = undefined;
}

function resolveSessionShortcutKeys(): string {
  if (cachedTmuxShortcutKeys === undefined) {
    cachedTmuxShortcutKeys = getOption("global", "@work-session-shortcut-keys");
  }
  return cachedTmuxShortcutKeys ?? getConfigValue("session-shortcut-keys");
}

/** 0-based choose-session list position → shortcut label. */
export function formatChooseKey(chooseIndex: number, keys: string): string {
  if (!Number.isFinite(chooseIndex) || chooseIndex < 0) return "?";
  const key = keys[chooseIndex];
  if (key !== undefined) return key;
  return String(chooseIndex);
}

/** 0-based choose-session list position → shortcut label (configured alphabet). */
export function formatTmuxSessionKey(chooseIndex: number): string {
  return formatChooseKey(chooseIndex, resolveSessionShortcutKeys());
}

/** tmux session id number ($N → N) → choose-session shortcut (0-based). */
export function formatTmuxSessionKeyFromId(sessionIdNumber: number): string {
  return formatTmuxSessionKey(sessionIdNumber - 1);
}

export interface TmuxSession {
  id: string;
  name: string;
  index: number;
  windowCount: number;
  attached: boolean;
  created: number;
}

export interface TmuxWindow {
  id: string;
  sessionName: string;
  index: number;
  name: string;
  active: boolean;
  paneCount: number;
}

export interface TmuxPane {
  id: string;
  sessionName: string;
  windowId: string;
  windowIndex: number;
  windowName: string;
  index: number;
  pid: number;
  currentCommand: string;
  currentPath: string;
  title: string;
  width: number;
  height: number;
  active: boolean;
  workSidebar: boolean;
  workAgentCli: string | null;
  workAgentLabel: string | null;
}

const SESSION_FMT = [
  "#{session_id}",
  "#{session_name}",
  "#{session_windows}",
  "#{session_attached}",
  "#{session_created}",
].join("\t");

const WINDOW_FMT = [
  "#{window_id}",
  "#{session_name}",
  "#{window_index}",
  "#{window_name}",
  "#{window_active}",
  "#{window_panes}",
].join("\t");

const PANE_FMT = [
  "#{pane_id}",
  "#{session_name}",
  "#{window_id}",
  "#{window_index}",
  "#{window_name}",
  "#{pane_index}",
  "#{pane_pid}",
  "#{pane_current_command}",
  "#{pane_current_path}",
  "#{pane_title}",
  "#{pane_width}",
  "#{pane_height}",
  "#{window_active}#{pane_active}",
  "#{@work-sidebar}",
  "#{@work-agent-cli}",
  "#{@work-agent-label}",
].join("\t");

function parseLines<T>(output: string, parser: (fields: string[]) => T): T[] {
  if (!output) return [];
  return output.split("\n").map((line) => parser(line.split("\t")));
}

export function listSessions(): TmuxSession[] {
  const out = tmux("list-sessions", "-F", SESSION_FMT);
  return parseLines(out, (f) => ({
    id: f[0],
    name: f[1],
    index: tmuxSessionIndex(f[0]),
    windowCount: parseInt(f[2], 10),
    attached: f[3] === "1",
    created: parseInt(f[4], 10),
  }));
}

export function listWindows(session?: string): TmuxWindow[] {
  const args = ["list-windows", "-F", WINDOW_FMT];
  if (session) args.push("-t", session);
  else args.push("-a");
  const out = tmux(...args);
  return parseLines(out, (f) => ({
    id: f[0],
    sessionName: f[1],
    index: parseInt(f[2], 10),
    name: f[3],
    active: f[4] === "1",
    paneCount: parseInt(f[5], 10),
  }));
}

/** Disambiguate session names from window names (e.g. session `agents` vs window `agents`). */
export function normalizeTmuxTarget(target: string): string {
  if (
    target.startsWith("%") ||
    target.startsWith("@") ||
    target.startsWith("=") ||
    target.includes(":")
  ) {
    return target;
  }
  return `${target}:`;
}

export function listPanes(target?: string): TmuxPane[] {
  const args = ["list-panes", "-F", PANE_FMT];
  if (target) {
    if (
      !target.startsWith("%") &&
      !target.startsWith("@") &&
      !target.startsWith("=") &&
      !target.includes(":")
    ) {
      args.push("-s");
    }
    args.push("-t", normalizeTmuxTarget(target));
  } else args.push("-a");
  const out = tmux(...args);
  return parseLines(out, (f) => ({
    id: f[0],
    sessionName: f[1],
    windowId: f[2],
    windowIndex: parseInt(f[3], 10),
    windowName: f[4],
    index: parseInt(f[5], 10),
    pid: parseInt(f[6], 10),
    currentCommand: f[7],
    currentPath: f[8],
    title: f[9],
    width: parseInt(f[10], 10),
    height: parseInt(f[11], 10),
    active: f[12] === "11",
    workSidebar: f[13] === "1",
    workAgentCli: f[14] || null,
    workAgentLabel: f[15] || null,
  }));
}

export function getPane(paneId: string): TmuxPane | null {
  try {
    const panes = listPanes(paneId);
    return panes.find((pane) => pane.id === paneId) ?? null;
  } catch {
    return null;
  }
}

export function splitWindow(opts: {
  target?: string;
  horizontal?: boolean;
  size?: number | string;
  command?: string;
  before?: boolean;
  cwd?: string;
}): string {
  const args = ["split-window", "-P", "-F", "#{pane_id}"];
  if (opts.horizontal) args.push("-h");
  if (opts.before) args.push("-b");
  if (opts.size != null) args.push("-l", String(opts.size));
  if (opts.cwd) args.push("-c", opts.cwd);
  if (opts.target) args.push("-t", opts.target);
  if (opts.command) args.push(opts.command);
  return tmux(...args);
}

export function newSession(opts: {
  name: string;
  cwd?: string;
  windowName?: string;
  attach?: boolean;
}): string {
  const args = ["new-session", "-P", "-F", "#{session_name}"];
  if (!opts.attach) args.push("-d");
  args.push("-s", opts.name);
  if (opts.cwd) args.push("-c", opts.cwd);
  if (opts.windowName) args.push("-n", opts.windowName);
  return tmux(...args);
}

export function newWindow(opts: {
  target: string;
  name?: string;
  cwd?: string;
}): string {
  const args = ["new-window", "-P", "-F", "#{window_id}"];
  args.push("-t", opts.target);
  if (opts.name) args.push("-n", opts.name);
  if (opts.cwd) args.push("-c", opts.cwd);
  return tmux(...args);
}

export function sendKeys(target: string, keys: string, enter = false): void {
  const args = ["send-keys", "-t", target, keys];
  if (enter) args.push("Enter");
  tmux(...args);
}

export function killSession(name: string): void {
  tmux("kill-session", "-t", name);
}

export function attachSession(name: string): void {
  tmux("attach-session", "-t", name);
}

export function activePaneInWindow(windowTarget: string): string {
  const panes = tmux(
    "list-panes",
    "-t",
    windowTarget,
    "-F",
    "#{pane_id}\t#{pane_active}",
  );
  for (const line of panes.split("\n")) {
    if (!line) continue;
    const [paneId, active] = line.split("\t");
    if (active === "1") return paneId;
  }
  const first = panes.split("\n")[0]?.split("\t")[0];
  if (!first) throw new Error(`No panes in window ${windowTarget}`);
  return first;
}

export function respawnPane(paneId: string, opts?: { cwd?: string }): void {
  const args = ["respawn-pane", "-k", "-t", paneId];
  if (opts?.cwd) args.push("-c", opts.cwd);
  tmux(...args);
}

export function renameWindow(target: string, name: string): void {
  tmux("rename-window", "-t", target, name);
}

export function unsetOption(
  scope: "global" | "session" | "window" | "pane",
  name: string,
  target?: string,
): void {
  const args = ["set-option", "-u"];
  switch (scope) {
    case "global":
      args.push("-g");
      break;
    case "pane":
      args.push("-p");
      break;
    case "window":
      args.push("-w");
      break;
  }
  if (target) args.push("-t", target);
  args.push(name);
  tmux(...args);
}

export function killPane(paneId: string): void {
  tmux("kill-pane", "-t", paneId);
}

export function setOption(
  scope: "global" | "session" | "window" | "pane",
  name: string,
  value: string,
  target?: string,
): void {
  const args = ["set-option"];
  switch (scope) {
    case "global":
      args.push("-g");
      break;
    case "pane":
      args.push("-p");
      break;
    case "window":
      args.push("-w");
      break;
  }
  if (target) args.push("-t", target);
  args.push(name, value);
  tmux(...args);
}

export function getOption(
  scope: "global" | "session" | "window" | "pane",
  name: string,
  target?: string,
): string | null {
  const args = ["show-option", "-qv"];
  switch (scope) {
    case "global":
      args.push("-g");
      break;
    case "pane":
      args.push("-p");
      break;
    case "window":
      args.push("-w");
      break;
  }
  if (target) args.push("-t", target);
  args.push(name);
  try {
    return tmux(...args) || null;
  } catch {
    return null;
  }
}

export function capturePane(
  paneId: string,
  opts?: { start?: number; end?: number },
): string {
  const args = ["capture-pane", "-p", "-t", paneId];
  if (opts?.start != null) args.push("-S", String(opts.start));
  if (opts?.end != null) args.push("-E", String(opts.end));
  return tmux(...args);
}

export function hasSession(name: string): boolean {
  try {
    tmux("has-session", "-t", name);
    return true;
  } catch {
    return false;
  }
}

export function getServerPid(): number | null {
  try {
    const out = tmux("display-message", "-p", "#{pid}");
    return out ? parseInt(out, 10) : null;
  } catch {
    return null;
  }
}

export function displayMessage(format: string, target?: string): string {
  const args = ["display-message", "-p", format];
  if (target) args.push("-t", target);
  return tmux(...args);
}
