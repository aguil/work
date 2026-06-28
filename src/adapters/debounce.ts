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
  let nextStatus = observed.status;
  let nextConfidence = observed.confidence;

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
