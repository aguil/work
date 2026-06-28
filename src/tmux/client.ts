import { execFileSync } from "node:child_process";

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

export interface TmuxSession {
  id: string;
  name: string;
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
  index: number;
  pid: number;
  currentCommand: string;
  currentPath: string;
  title: string;
  width: number;
  height: number;
  active: boolean;
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
  "#{pane_index}",
  "#{pane_pid}",
  "#{pane_current_command}",
  "#{pane_current_path}",
  "#{pane_title}",
  "#{pane_width}",
  "#{pane_height}",
  "#{window_active}#{pane_active}",
].join("\t");

function parseLines<T>(
  output: string,
  parser: (fields: string[]) => T,
): T[] {
  if (!output) return [];
  return output.split("\n").map((line) => parser(line.split("\t")));
}

export function listSessions(): TmuxSession[] {
  const out = tmux("list-sessions", "-F", SESSION_FMT);
  return parseLines(out, (f) => ({
    id: f[0],
    name: f[1],
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

export function listPanes(target?: string): TmuxPane[] {
  const args = ["list-panes", "-F", PANE_FMT];
  if (target) args.push("-t", target);
  else args.push("-a");
  const out = tmux(...args);
  return parseLines(out, (f) => ({
    id: f[0],
    sessionName: f[1],
    windowId: f[2],
    windowIndex: parseInt(f[3], 10),
    index: parseInt(f[4], 10),
    pid: parseInt(f[5], 10),
    currentCommand: f[6],
    currentPath: f[7],
    title: f[8],
    width: parseInt(f[9], 10),
    height: parseInt(f[10], 10),
    active: f[11] === "11",
  }));
}

export function splitWindow(opts: {
  target?: string;
  horizontal?: boolean;
  size?: number | string;
  command?: string;
  before?: boolean;
}): string {
  const args = ["split-window", "-P", "-F", "#{pane_id}"];
  if (opts.horizontal) args.push("-h");
  if (opts.before) args.push("-b");
  if (opts.size != null) args.push("-l", String(opts.size));
  if (opts.target) args.push("-t", opts.target);
  if (opts.command) args.push(opts.command);
  return tmux(...args);
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
  const args = ["show-option", "-v"];
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
