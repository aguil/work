import { TMUX_STATUS_ICONS } from "../sidebar/icons.js";
import type { AgentRecord } from "./state.js";

/** Agent is bound to a live tmux pane and not detached. */
export function hasLivePane(agent: AgentRecord): boolean {
  return agent.paneId != null && agent.status !== "detached";
}

/** Sidebar lists live agents; idle panes stay visible between turns. */
export function isSidebarAgent(agent: AgentRecord): boolean {
  if (!hasLivePane(agent)) return false;
  return agent.status !== "done";
}

export interface StatusLineCounts {
  working: number;
  blocked: number;
  idle: number;
  total: number;
}

/** Count agents the sidebar would list, grouped for tmux status-right. */
export function countStatusLineAgents(
  agents: Iterable<AgentRecord>,
): StatusLineCounts {
  const counts: StatusLineCounts = {
    working: 0,
    blocked: 0,
    idle: 0,
    total: 0,
  };
  for (const agent of agents) {
    if (!isSidebarAgent(agent)) continue;
    switch (agent.status) {
      case "working":
        counts.working++;
        break;
      case "blocked":
        counts.blocked++;
        break;
      case "idle":
      case "unknown":
      case "error":
        counts.idle++;
        break;
      default:
        continue;
    }
    counts.total++;
  }
  return counts;
}

/** Single tmux status-color icon for a window tab (blocked > working > idle). */
export function formatIconForTmux(counts: StatusLineCounts): string {
  if (counts.blocked > 0) {
    return `#[fg=red]${TMUX_STATUS_ICONS.blocked}#[default]`;
  }
  if (counts.working > 0) {
    return `#[fg=yellow]${TMUX_STATUS_ICONS.working}#[default]`;
  }
  if (counts.idle > 0) {
    return `#[fg=green]${TMUX_STATUS_ICONS.idle}#[default]`;
  }
  return "";
}
