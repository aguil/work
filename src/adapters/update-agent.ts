import type { TmuxPane } from "../tmux/client.js";
import type { AgentRecord } from "../workspace/state.js";
import { isActiveAgentTitle } from "./agent-title.js";
import {
  applyObservation,
  hasExplicitHookStatus,
  observationOverridesExplicit,
} from "./debounce.js";
import { observeAgentPane, observePane } from "./observe.js";
import type { ObservationResult } from "./types.js";

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

/** A pane read taken outside the workspace lock, applied under it later. */
export interface PaneObservation {
  pane: TmuxPane;
  result: ObservationResult;
}

function titleVouchesForWorking(agent: AgentRecord, pane: TmuxPane): boolean {
  return (
    hasExplicitHookStatus(agent) &&
    agent.status === "working" &&
    isActiveAgentTitle(pane.title)
  );
}

/** Reads each agent's pane. Changes no record, so it needs no lock. */
export function observeAgents(
  agents: Iterable<AgentRecord>,
  paneById: Map<string, TmuxPane>,
): Map<string, PaneObservation> {
  const observations = new Map<string, PaneObservation>();
  for (const agent of agents) {
    if (!agent.paneId || agent.status === "detached") continue;
    const pane = paneById.get(agent.paneId);
    if (!pane || titleVouchesForWorking(agent, pane)) continue;
    const result = observePane(pane, agent.cli);
    if (result) observations.set(pane.id, { pane, result });
  }
  return observations;
}

/**
 * Applies a read to the current record, which a hook may have changed since
 * the read, so the same gate runs against what is there now.
 */
export function applyPaneObservation(
  agent: AgentRecord,
  { pane, result }: PaneObservation,
): boolean {
  if (agent.status === "detached" || agent.paneId !== pane.id) return false;
  if (hasExplicitHookStatus(agent)) {
    if (titleVouchesForWorking(agent, pane)) return false;
    if (!observationOverridesExplicit(result)) return false;
    return applyObservation(agent, result, { trustIdle: true });
  }
  return applyObservation(agent, result);
}

export const HOOK_TTL_MS = 15 * 60_000;

/**
 * A hook status is only as good as the hooks behind it: once they go quiet on
 * a live pane, screen observation owns the status again. A record from before
 * this field has no clock, so its first poll starts one.
 */
export function ageHookConfidence(agent: AgentRecord, now: number): boolean {
  if (!hasExplicitHookStatus(agent)) return false;
  if (!agent.lastHookEventAt) {
    agent.lastHookEventAt = new Date(now).toISOString();
    return true;
  }
  if (now - Date.parse(agent.lastHookEventAt) <= HOOK_TTL_MS) return false;
  agent.confidence = "heuristic";
  return true;
}

/** A tie applies: two events in one tick land in arrival order. */
export function isStaleHookEvent(
  agent: AgentRecord,
  eventTs: number | undefined,
): boolean {
  return (
    eventTs !== undefined &&
    agent.lastEventTs !== undefined &&
    eventTs < agent.lastEventTs
  );
}

/**
 * `sessionEnd` unlinks its agent from the pane, so a late event from that pane
 * finds no record to compare against and would create a new one.
 */
export function paneEndedAfter(
  agents: Iterable<AgentRecord>,
  paneId: string,
  eventTs: number | undefined,
): boolean {
  for (const agent of agents) {
    if (agent.endedPaneId === paneId && isStaleHookEvent(agent, eventTs)) {
      return true;
    }
  }
  return false;
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
