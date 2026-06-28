import type { AgentStatus } from "../workspace/state.js";

const STATUS_ICONS: Record<AgentStatus, string> = {
  working: "⟳",
  blocked: "⏸",
  idle: "–",
  done: "✓",
  error: "✗",
  detached: "⊘",
  unknown: "·",
};

const STATUS_COLORS: Record<AgentStatus, string> = {
  working: "\x1b[33m",   // yellow
  blocked: "\x1b[31m",   // red
  idle: "\x1b[32m",      // green
  done: "\x1b[32m",      // green
  error: "\x1b[31m",     // red
  detached: "\x1b[90m",  // dim
  unknown: "\x1b[90m",   // dim
};

const RESET = "\x1b[0m";

export function statusIcon(status: AgentStatus): string {
  return STATUS_ICONS[status] ?? "?";
}

export function coloredStatus(status: AgentStatus): string {
  return `${STATUS_COLORS[status]}${STATUS_ICONS[status]}${RESET}`;
}

export function coloredText(text: string, color: string): string {
  return `${color}${text}${RESET}`;
}

export const colors = {
  dim: "\x1b[90m",
  bold: "\x1b[1m",
  reset: RESET,
  white: "\x1b[37m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
} as const;
