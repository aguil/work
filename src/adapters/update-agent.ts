import type { TmuxPane } from "../tmux/client.js";
import type { AgentRecord } from "../workspace/state.js";
import { isActiveAgentTitle } from "./agent-title.js";
import {
  applyObservation,
  hasExplicitHookStatus,
  observationOverridesExplicit,
} from "./debounce.js";
import { observeAgentPane, observePane } from "./observe.js";

export function updateAgentFromPane(
  agent: AgentRecord,
  paneId: string,
): boolean {
  if (agent.status === "detached" || !agent.paneId) return false;
  if (hasExplicitHookStatus(agent)) {
    const result = observeAgentPane(paneId, agent.cli);
    if (!result || !observationOverridesExplicit(result)) return false;
    return applyObservation(agent, result, { trustIdle: true });
  }

  const result = observeAgentPane(paneId, agent.cli);
  if (!result) return false;
  return applyObservation(agent, result);
}

export function observeAgentsInWorkspace(
  agents: Iterable<AgentRecord>,
  paneById: Map<string, TmuxPane>,
): boolean {
  let changed = false;
  for (const agent of agents) {
    if (!agent.paneId || agent.status === "detached") continue;
    const pane = paneById.get(agent.paneId);
    if (!pane) continue;
    if (hasExplicitHookStatus(agent)) {
      if (agent.status === "working" && isActiveAgentTitle(pane.title)) {
        continue;
      }
      const result = observePane(pane, agent.cli);
      if (!result || !observationOverridesExplicit(result)) continue;
      if (applyObservation(agent, result, { trustIdle: true })) changed = true;
      continue;
    }
    const result = observePane(pane, agent.cli);
    if (!result) continue;
    if (applyObservation(agent, result)) changed = true;
  }
  return changed;
}

/**
 * A hook-created record written before hooks reported their CLI has
 * `cli: "agent"`, which resolves to Cursor's manifest whatever fired the hook.
 * Only a hook can correct it: detection echoes a registered pane's
 * `@work-agent-cli`. The label stays, since records are keyed by it.
 */
export function correctAgentCli(agent: AgentRecord, cli: string): boolean {
  if (agent.cli !== "agent" || cli === "agent") return false;
  agent.cli = cli;
  return true;
}
