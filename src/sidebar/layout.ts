import type { AgentView, SessionSnapshot } from "../daemon/protocol.js";
import type { TreeView } from "../vcs/detect.js";
import { isSidebarAgent } from "../workspace/agent-display.js";
import type { AgentStatus } from "../workspace/state.js";
import { resolveSessionIndex } from "./normalize.js";
import type { SessionShortcutContext } from "./session-shortcut.js";
import {
  formatSessionShortcutLabelFromContext,
  formatTmuxSessionKey,
} from "./session-shortcut.js";

const STATUS_SORT: Record<AgentStatus, number> = {
  blocked: 0,
  working: 1,
  idle: 2,
  unknown: 3,
  error: 3,
  done: 4,
  detached: 5,
};

export function sortAgents(agents: AgentView[]): AgentView[] {
  return [...agents].filter(isSidebarAgent).sort((a, b) => {
    const sa = STATUS_SORT[a.status] ?? 9;
    const sb = STATUS_SORT[b.status] ?? 9;
    if (sa !== sb) return sa - sb;
    const sessionCmp = (a.sessionIndex ?? 0) - (b.sessionIndex ?? 0);
    if (sessionCmp !== 0) return sessionCmp;
    if (a.windowIndex !== b.windowIndex) return a.windowIndex - b.windowIndex;
    return a.label.localeCompare(b.label);
  });
}

export function collectSidebarAgents(sessions: SessionSnapshot[]): AgentView[] {
  return sortAgents(sessions.flatMap((s) => s.agents));
}

export function worstAgentStatus(agents: AgentView[]): AgentStatus | null {
  const live = agents.filter(isSidebarAgent);
  if (live.length === 0) return null;
  let worst: AgentStatus = "idle";
  let worstRank = STATUS_SORT.idle;
  for (const agent of live) {
    const rank = STATUS_SORT[agent.status] ?? 9;
    if (rank < worstRank) {
      worstRank = rank;
      worst = agent.status;
    }
  }
  return worst;
}

export function sortSessions(sessions: SessionSnapshot[]): SessionSnapshot[] {
  return [...sessions].sort((a, b) => {
    const rank = (s: SessionSnapshot): number => {
      if (!s.tracked) return 6;
      const worst = worstAgentStatus(s.agents);
      if (s.attached && worst === "blocked") return 0;
      if (s.attached && worst === "working") return 1;
      if (worst === "blocked") return 2;
      if (worst === "working") return 3;
      if (s.attached) return 4;
      return 5;
    };
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    return resolveSessionIndex(a) - resolveSessionIndex(b);
  });
}

/** tmux window_index is 0-based; display 1-based to match tab labels. */
export function formatWindowLocation(
  agent: AgentView,
  session?: SessionSnapshot,
  shortcutContext?: SessionShortcutContext,
): string {
  const sessionName = agent.sessionName?.trim() || session?.name || "?";
  const windowIndex = (agent.windowIndex ?? 0) + 1;
  const windowName = agent.windowName?.trim() || "?";

  const resolvedSession =
    session ??
    ({
      id: `$${agent.sessionIndex ?? 0}`,
      name: sessionName,
      index: agent.sessionIndex ?? 0,
      windowCount: 0,
      attached: false,
      tracked: false,
      workspaceName: null,
      agents: [],
      trees: [],
    } satisfies SessionSnapshot);

  const shortcut = shortcutContext
    ? formatSessionShortcutLabelFromContext(resolvedSession, shortcutContext)
    : formatTmuxSessionKey(
        Math.max(0, resolveSessionIndex(resolvedSession) - 1),
      );

  return `${shortcut}:${sessionName} · ${windowIndex}:${windowName}`;
}

export function formatSessionTitle(
  session: SessionSnapshot,
  shortcutContext: SessionShortcutContext,
): string {
  const attached = session.attached ? " *" : "";
  const untracked = session.tracked ? "" : " ○";
  const shortcut = formatSessionShortcutLabelFromContext(
    session,
    shortcutContext,
  );
  return `${shortcut}:${session.name}${attached}${untracked}`;
}

export function repoBasename(tree: TreeView): string {
  return tree.path.split("/").pop() ?? tree.path;
}

/** Basename, extended with parent segments when names collide in one session. */
export function repoDisplayName(tree: TreeView, trees: TreeView[]): string {
  const basename = repoBasename(tree);
  const collisions = trees.filter((t) => repoBasename(t) === basename);
  if (collisions.length <= 1) return basename;

  const parts = tree.path.split("/");
  for (let segments = 2; segments <= parts.length; segments++) {
    const candidate = parts.slice(-segments).join("/");
    const dupes = collisions.filter((t) => {
      const segs = t.path.split("/");
      return segs.slice(-segments).join("/") === candidate;
    });
    if (dupes.length === 1) return candidate;
  }
  return tree.path;
}
