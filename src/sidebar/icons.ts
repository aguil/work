import type { AgentStatus } from "../workspace/state.js";

/** Nerdfont status glyphs (default everywhere). */
const STATUS_ICONS: Record<AgentStatus, string> = {
  working: "\u{f0772}", // 󰝲 nf-md-loading
  blocked: "\u{f0028}", // 󰀨 nf-md-alert-circle
  idle: "\u{f05e1}", // 󰗡 nf-md-check-circle-outline
  done: "\u{f012c}", // 󰄬 nf-md-check
  error: "\u{f0029}", // 󰀩 nf-md-alert-octagon
  detached: "\u{f0490}", // 󰒐 nf-md-link-off
  unknown: "\u{f0550}", // 󰕐 nf-md-help-circle
};

const STATUS_COLORS: Record<AgentStatus, string> = {
  working: "\x1b[33m",
  blocked: "\x1b[31m",
  idle: "\x1b[32m",
  done: "\x1b[32m",
  error: "\x1b[31m",
  detached: "\x1b[90m",
  unknown: "\x1b[90m",
};

/** Tmux status-right / window-tab icons (same glyphs). */
export const TMUX_STATUS_ICONS: Record<"working" | "blocked" | "idle", string> =
  {
    working: STATUS_ICONS.working,
    blocked: STATUS_ICONS.blocked,
    idle: STATUS_ICONS.idle,
  };

const VCS_ICONS = {
  git: "\u{f0302}", // 󰊢 nf-dev-git
  jj: "\u{f062c}", // 󰘬 nf-md-source-branch
  plain: "\u{f024b}", // 󰉋 nf-md-folder
} as const;

const RESET = "\x1b[0m";

export function statusIcon(status: AgentStatus): string {
  return STATUS_ICONS[status] ?? STATUS_ICONS.unknown;
}

export function coloredStatus(status: AgentStatus): string {
  return `${STATUS_COLORS[status]}${STATUS_ICONS[status]}${RESET}`;
}

export function vcsIcon(vcsType: keyof typeof VCS_ICONS): string {
  return VCS_ICONS[vcsType];
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
