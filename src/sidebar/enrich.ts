import type { AgentView } from "../daemon/protocol.js";
import type { TmuxPane } from "../tmux/client.js";
import { tmuxSessionIndex } from "../tmux/client.js";
import type { AgentRecord } from "../workspace/state.js";

export interface SessionRef {
  name: string;
  id: string;
  index?: number;
}

function normalizeWindowName(name: string | undefined): string {
  const trimmed = name?.trim();
  return trimmed ? trimmed : "?";
}

export function enrichAgentView(
  agent: AgentRecord,
  session: SessionRef,
  paneById: Map<string, TmuxPane>,
): AgentView {
  const pane = agent.paneId ? paneById.get(agent.paneId) : undefined;
  return {
    ...agent,
    sessionIndex: session.index ?? tmuxSessionIndex(session.id),
    sessionName: pane?.sessionName?.trim() || session.name || "?",
    windowIndex: pane?.windowIndex ?? 0,
    windowName: normalizeWindowName(pane?.windowName),
  };
}
