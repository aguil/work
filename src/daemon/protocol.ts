import type { AgentRecord, TreeRecord } from "../workspace/state.js";

export interface SessionSnapshot {
  id: string;
  name: string;
  windowCount: number;
  attached: boolean;
  tracked: boolean;
  workspaceName: string | null;
  agents: AgentRecord[];
  trees: TreeRecord[];
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

export function encode(msg: DaemonMessage | ClientMessage): string {
  return JSON.stringify(msg) + "\n";
}

export function decode(line: string): DaemonMessage | ClientMessage | null {
  try {
    return JSON.parse(line.trim()) as DaemonMessage | ClientMessage;
  } catch {
    return null;
  }
}
