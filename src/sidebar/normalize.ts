import type { AgentView, SessionSnapshot } from "../daemon/protocol.js";
import { tmuxSessionIndex } from "../tmux/client.js";

/** Resolve tmux session index from snapshot fields (IPC-safe). */
export function resolveSessionIndex(session: SessionSnapshot): number {
  if (typeof session.index === "number" && !Number.isNaN(session.index)) {
    return session.index;
  }
  return tmuxSessionIndex(session.id);
}

export function resolveAgentSessionIndex(
  agent: AgentView,
  session: SessionSnapshot,
): number {
  if (
    typeof agent.sessionIndex === "number" &&
    !Number.isNaN(agent.sessionIndex)
  ) {
    return agent.sessionIndex;
  }
  return resolveSessionIndex(session);
}

export function normalizeSessions(
  sessions: SessionSnapshot[],
): SessionSnapshot[] {
  return sessions.map((session) => {
    const index = resolveSessionIndex(session);
    return {
      ...session,
      index,
      agents: session.agents.map((agent) => ({
        ...agent,
        sessionName: agent.sessionName?.trim() || session.name,
        sessionIndex: resolveAgentSessionIndex(agent, { ...session, index }),
      })),
    };
  });
}
