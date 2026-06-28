import type { SessionSnapshot } from "../daemon/protocol.js";
import type { AgentRecord } from "../workspace/state.js";
import { coloredStatus, colors } from "./icons.js";

const { dim, bold, reset, cyan, green } = colors;

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

function pad(s: string, width: number): string {
  const visible = s.replace(/\x1b\[[0-9;]*m/g, "");
  if (visible.length >= width) return s;
  return s + " ".repeat(width - visible.length);
}

function hr(width: number, char = "─"): string {
  return dim + char.repeat(width) + reset;
}

export function render(
  sessions: SessionSnapshot[],
  cols: number,
  rows: number,
  daemonConnected: boolean,
): string {
  const lines: string[] = [];
  const w = Math.max(cols - 1, 20);

  // Header
  const statusDot = daemonConnected
    ? `${green}●${reset}`
    : `${colors.red}●${reset}`;
  lines.push(`${bold}workctl${reset} ${statusDot}`);
  lines.push(hr(w));

  // Sort: tracked first, then by name
  const sorted = [...sessions].sort((a, b) => {
    if (a.tracked !== b.tracked) return a.tracked ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  for (const session of sorted) {
    if (lines.length >= rows - 2) break;

    const agentCount = session.agents.filter(
      (a) => a.status !== "detached",
    ).length;
    const treeCount = session.trees.length;
    const marker = session.tracked ? `${cyan}▸${reset}` : `${dim}○${reset}`;
    const nameStyle = session.tracked ? bold : dim;
    const countParts: string[] = [];
    if (agentCount > 0) countParts.push(String(agentCount));
    if (session.tracked && treeCount > 0) {
      countParts.push(`${treeCount}t`);
    }
    const countSuffix =
      countParts.length > 0
        ? ` ${dim}(${countParts.join(" · ")})${reset}`
        : "";
    const attachedMark = session.attached ? `${green}*${reset}` : "";

    lines.push(
      `${marker} ${nameStyle}${truncate(session.name, w - 10)}${reset}${attachedMark}${countSuffix}`,
    );

    if (session.tracked) {
      for (const agent of session.agents) {
        if (agent.status === "detached") continue;
        if (lines.length >= rows - 2) break;
        lines.push(renderAgent(agent, w));
      }

      for (const tree of session.trees) {
        if (lines.length >= rows - 2) break;
        const branchInfo = tree.branch ? ` ${dim}${tree.branch}${reset}` : "";
        const dirtyMark = tree.dirty ? `${colors.yellow}*${reset}` : "";
        const syncInfo =
          tree.ahead != null && tree.behind != null
            ? ` ${dim}↑${tree.ahead}↓${tree.behind}${reset}`
            : "";
        const vcsTag = tree.vcsType !== "plain" ? `${dim}[${tree.vcsType}]${reset} ` : "";
        const name = tree.path.split("/").pop() ?? tree.path;
        lines.push(
          `    ${vcsTag}${truncate(name, w - 16)}${branchInfo}${dirtyMark}${syncInfo}`,
        );
      }
    }
  }

  // Footer
  while (lines.length < rows - 2) {
    lines.push("");
  }
  lines.push(hr(w));
  lines.push(`${dim}^W toggle  ^S track${reset}`);

  return (
    "\x1b[H\x1b[2J" + lines.map((l) => pad(l, w)).join("\n")
  );
}

function renderAgent(agent: AgentRecord, width: number): string {
  const icon = coloredStatus(agent.status);
  const label = truncate(agent.label, width - 10);
  return `  ${icon} ${label}`;
}
