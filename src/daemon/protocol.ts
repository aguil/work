import type { TreeView } from "../vcs/detect.js";
import type { AgentRecord } from "../workspace/state.js";

/** Agent row for sidebar / daemon snapshots (pane location included). */
export interface AgentView extends AgentRecord {
  sessionIndex: number;
  sessionName: string;
  windowIndex: number;
  windowName: string;
}

export interface SessionSnapshot {
  id: string;
  name: string;
  index: number;
  windowCount: number;
  attached: boolean;
  tracked: boolean;
  workspaceName: string | null;
  agents: AgentView[];
  trees: TreeView[];
}

export interface StateSnapshot {
  type: "snapshot";
  sessions: SessionSnapshot[];
  timestamp: string;
}

export interface StateUpdate {
  type: "update";
  sessions: SessionSnapshot[];
  timestamp: string;
}

export interface CommandRequest {
  type: "command";
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface CommandResponse {
  type: "response";
  id: string;
  ok: boolean;
  data?: unknown;
  error?: string;
}

export type DaemonMessage = StateSnapshot | StateUpdate | CommandResponse;
export type ClientMessage = CommandRequest | { type: "subscribe" };

/** Stable key for comparing sidebar-visible daemon snapshots. */
export function snapshotFingerprint(sessions: SessionSnapshot[]): string {
  return JSON.stringify(sessions);
}

export function encode(msg: DaemonMessage | ClientMessage): string {
  return `${JSON.stringify(msg)}\n`;
}

export function decode(line: string): DaemonMessage | ClientMessage | null {
  try {
    return JSON.parse(line.trim()) as DaemonMessage | ClientMessage;
  } catch {
    return null;
  }
}
