import type { AgentRecord, AgentStatus } from "../workspace/state.js";
import type { ObservationResult } from "./types.js";

export const IDLE_CONFIRMATIONS = 3;

const DEBOUNCE_FROM: ReadonlySet<AgentStatus> = new Set([
  "working",
  "blocked",
  "unknown",
]);

export function applyObservation(
  agent: AgentRecord,
  observed: ObservationResult,
): boolean {
  const nextStatus = observed.status;
  const nextConfidence = observed.confidence;

  if (nextStatus === "idle" && DEBOUNCE_FROM.has(agent.status)) {
    const count = (agent.pendingIdleCount ?? 0) + 1;
    agent.pendingIdleCount = count;
    agent.lastSeen = new Date().toISOString();
    if (count < IDLE_CONFIRMATIONS) {
      return true;
    }
  } else {
    agent.pendingIdleCount = 0;
  }

  const changed =
    agent.status !== nextStatus || agent.confidence !== nextConfidence;

  agent.status = nextStatus;
  agent.confidence = nextConfidence;
  agent.lastSeen = new Date().toISOString();
  return changed;
}

export function resetObservation(agent: AgentRecord): void {
  agent.pendingIdleCount = 0;
}

export function hasExplicitHookStatus(agent: AgentRecord): boolean {
  return agent.confidence === "explicit";
}

export function applyHookStatus(
  agent: AgentRecord,
  status: AgentStatus,
  eventName: string,
): boolean {
  agent.pendingIdleCount = 0;
  const changed =
    agent.status !== status ||
    agent.confidence !== "explicit" ||
    agent.hookEvent !== eventName;

  agent.status = status;
  agent.confidence = "explicit";
  agent.hookEvent = eventName;
  agent.lastSeen = new Date().toISOString();
  return changed;
}
