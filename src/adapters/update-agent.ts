import * as tmux from "../tmux/client.js";
import type { AgentRecord } from "../workspace/state.js";
import { applyObservation } from "./debounce.js";
import { observeAgentPane, observePane } from "./observe.js";

export function updateAgentFromPane(
  agent: AgentRecord,
  paneId: string,
): boolean {
  if (agent.status === "detached" || !agent.paneId) return false;

  const result = observeAgentPane(paneId, agent.cli);
  if (!result) return false;
  return applyObservation(agent, result);
}

export function observeAgentsInWorkspace(
  agents: Iterable<AgentRecord>,
): boolean {
  let changed = false;
  for (const agent of agents) {
    if (!agent.paneId || agent.status === "detached") continue;
    const pane = tmux.getPane(agent.paneId);
    if (!pane) continue;
    const result = observePane(pane, agent.cli);
    if (!result) continue;
    if (applyObservation(agent, result)) changed = true;
  }
  return changed;
}
