import type { AgentView, SessionSnapshot } from "../daemon/protocol.js";
import type { TreeView } from "../vcs/detect.js";
import {
  countStatusLineAgents,
  isSidebarAgent,
} from "../workspace/agent-display.js";
import { coloredStatus, colors, TMUX_STATUS_ICONS, vcsIcon } from "./icons.js";
import {
  collectSidebarAgents,
  formatSessionTitle,
  formatWindowLocation,
  repoDisplayName,
  sortSessions,
} from "./layout.js";
import { normalizeSessions } from "./normalize.js";
import { formatRevisionLabel } from "./revision.js";
import { createSessionShortcutContext } from "./session-shortcut.js";

const { dim, bold, reset, green } = colors;

const ANSI_ESCAPE = String.fromCharCode(0x1b);
const FOOTER_LINES = 2;

function truncateVisible(s: string, maxVisible: number): string {
  if (maxVisible <= 0) return "";
  if (visibleLength(s) <= maxVisible) return s;
  if (maxVisible <= 1) return "…";

  let visible = 0;
  let i = 0;
  let out = "";
  const target = maxVisible - 1;

  while (i < s.length && visible < target) {
    if (s.startsWith(ANSI_ESCAPE, i)) {
      const match = s.slice(i).match(new RegExp(`^${ANSI_ESCAPE}\\[[0-9;]*m`));
      if (match) {
        out += match[0];
        i += match[0].length;
        continue;
      }
    }
    out += s[i];
    visible++;
    i++;
  }
  return `${out}…${reset}`;
}

function visibleLength(s: string): number {
  return s.replace(new RegExp(`${ANSI_ESCAPE}\\[[0-9;]*m`, "g"), "").length;
}

function pad(s: string, width: number): string {
  const visible = visibleLength(s);
  if (visible >= width) return s;
  return s + " ".repeat(width - visible);
}

function hr(width: number): string {
  return dim + "─".repeat(width) + reset;
}

function renderAgentRow(
  agent: AgentView,
  width: number,
  session?: SessionSnapshot,
  shortcutContext?: ReturnType<typeof createSessionShortcutContext>,
): string {
  const icon = coloredStatus(agent.status);
  const location = formatWindowLocation(agent, session, shortcutContext);
  const iconLen = 1;
  const minLocation = 8;
  const gap = "  ";
  const maxLabel = Math.max(
    0,
    width - iconLen - gap.length - minLocation - gap.length,
  );
  const label = truncateVisible(agent.label, maxLabel);
  let loc = location;
  const used =
    iconLen + gap.length + visibleLength(label) + gap.length + loc.length;
  if (used > width) {
    const locBudget = Math.max(
      minLocation,
      width - iconLen - gap.length - visibleLength(label) - gap.length,
    );
    loc = truncateVisible(location, locBudget);
  }
  return `${icon}${gap}${label}${gap}${dim}${loc}${reset}`;
}

function renderCountBadge(icon: string, count: number, color: string): string {
  return `${color}${icon} ${count}${reset}`;
}

function renderAgentsHeader(
  counts: ReturnType<typeof countStatusLineAgents>,
  width: number,
): string {
  const parts: string[] = [`${bold}agents${reset}`];
  if (counts.blocked > 0) {
    parts.push(
      renderCountBadge(TMUX_STATUS_ICONS.blocked, counts.blocked, colors.red),
    );
  }
  if (counts.working > 0) {
    parts.push(
      renderCountBadge(
        TMUX_STATUS_ICONS.working,
        counts.working,
        colors.yellow,
      ),
    );
  }
  if (counts.idle > 0) {
    parts.push(
      renderCountBadge(TMUX_STATUS_ICONS.idle, counts.idle, colors.green),
    );
  }
  const line = parts.join("  ");
  return visibleLength(line) > width ? truncateVisible(line, width) : line;
}

function renderRepoChip(tree: TreeView, trees: TreeView[]): string {
  const name = repoDisplayName(tree, trees);
  const icon = vcsIcon(tree.vcsType);
  const revision = formatRevisionLabel(tree);
  const dirty = tree.dirty ? `${colors.yellow}*${reset}` : "";
  const sep = revision ? ` ${dim}·${reset} ` : "";
  return `${icon} ${name}${sep}${revision}${dirty}`;
}

function renderRepoLine(
  tree: TreeView,
  trees: TreeView[],
  width: number,
): string {
  const chip = renderRepoChip(tree, trees);
  return visibleLength(chip) > width ? truncateVisible(chip, width) : chip;
}

function renderSessionTopRule(
  session: SessionSnapshot,
  width: number,
  shortcutContext: ReturnType<typeof createSessionShortcutContext>,
): string {
  const title = formatSessionTitle(session, shortcutContext);
  const live = session.agents.filter(isSidebarAgent);
  let accent: string = dim;
  if (live.some((a) => a.status === "blocked")) accent = colors.red;
  else if (live.some((a) => a.status === "working")) accent = colors.yellow;

  const prefix = `─ ${title} `;
  const prefixLen = visibleLength(prefix);
  const ruleLen = Math.max(0, width - prefixLen);
  return `${accent}${prefix}${"─".repeat(ruleLen)}${reset}`;
}

function renderSessionCard(
  session: SessionSnapshot,
  width: number,
  shortcutContext: ReturnType<typeof createSessionShortcutContext>,
): string[] {
  const lines: string[] = [
    renderSessionTopRule(session, width, shortcutContext),
  ];
  if (session.tracked && session.trees.length > 0) {
    for (const tree of session.trees) {
      lines.push(renderRepoLine(tree, session.trees, width));
    }
  }
  return lines;
}

export function render(
  sessions: SessionSnapshot[],
  cols: number,
  rows: number,
  daemonConnected: boolean,
): string {
  const lines: string[] = [];
  const normalized = normalizeSessions(sessions);
  const shortcutContext = createSessionShortcutContext(normalized);
  const w = Math.max(cols - 1, 20);
  const maxBody = Math.max(0, rows - FOOTER_LINES);

  const sessionByName = new Map(normalized.map((s) => [s.name, s]));

  const findAgentSession = (agent: AgentView): SessionSnapshot | undefined => {
    const byName = agent.sessionName?.trim();
    if (byName) {
      const match = sessionByName.get(byName);
      if (match) return match;
    }
    if (agent.paneId) {
      return normalized.find((s) =>
        s.agents.some((a) => a.paneId === agent.paneId),
      );
    }
    return undefined;
  };

  const statusDot = daemonConnected
    ? `${green}●${reset}`
    : `${colors.red}●${reset}`;
  lines.push(`${bold}work${reset} ${statusDot}`);
  lines.push(hr(w));

  const agents = collectSidebarAgents(normalized);
  const counts = countStatusLineAgents(agents);

  if (lines.length < maxBody) {
    lines.push(renderAgentsHeader(counts, w));
  }

  let agentsTruncated = 0;
  for (const agent of agents) {
    if (lines.length >= maxBody) {
      agentsTruncated++;
      continue;
    }
    const session = findAgentSession(agent);
    lines.push(renderAgentRow(agent, w, session, shortcutContext));
  }
  if (agentsTruncated > 0 && lines.length < maxBody) {
    lines.push(`${dim}… +${agentsTruncated} agents${reset}`);
  }

  if (lines.length < maxBody) {
    lines.push("");
  }
  if (lines.length < maxBody) {
    lines.push(`${bold}sessions${reset}`);
  }

  const sortedSessions = sortSessions(normalized);
  let sessionsTruncated = 0;
  for (const session of sortedSessions) {
    const cardLines = renderSessionCard(session, w, shortcutContext);
    if (lines.length + cardLines.length > maxBody) {
      sessionsTruncated++;
      continue;
    }
    for (const line of cardLines) {
      lines.push(line);
    }
    if (lines.length < maxBody) {
      lines.push("");
    }
  }
  if (sessionsTruncated > 0 && lines.length < maxBody) {
    lines.push(`${dim}… +${sessionsTruncated} sessions${reset}`);
  }

  while (lines.length < maxBody) {
    lines.push("");
  }
  lines.push(hr(w));
  lines.push(`${dim}^W toggle  ^S track${reset}`);

  return `\x1b[H${lines.map((l) => pad(l, w)).join("\n")}\x1b[J`;
}
