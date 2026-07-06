import type { AgentRecord, AgentStatus } from "../workspace/state.js";
import type { ObservationResult } from "./types.js";

/** Screen evidence may clear stale explicit hook "working" when the turn ended. */
export function observationOverridesExplicit(
  observed: ObservationResult,
): boolean {
  return (
    observed.status === "idle" ||
    observed.status === "blocked" ||
    observed.status === "done" ||
    observed.status === "error"
  );
}

export const IDLE_CONFIRMATIONS = 3;

const DEBOUNCE_FROM: ReadonlySet<AgentStatus> = new Set([
  "working",
  "blocked",
  "unknown",
]);

export function applyObservation(
  agent: AgentRecord,
  observed: ObservationResult,
  options?: { trustIdle?: boolean },
): boolean {
  const nextStatus = observed.status;
  const nextConfidence = observed.confidence;

  if (
    nextStatus === "idle" &&
    DEBOUNCE_FROM.has(agent.status) &&
    !options?.trustIdle
  ) {
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
    agent.status !== nextStatus ||
    agent.confidence !== nextConfidence ||
    agent.statusReason !== (observed.ruleId ?? null) ||
    agent.visibleBlocker !== (observed.visibleBlocker ?? false);

  agent.status = nextStatus;
  agent.confidence = nextConfidence;
  agent.statusReason = observed.ruleId ?? null;
  agent.statusEvidence = observed.evidence ?? null;
  agent.visibleBlocker = observed.visibleBlocker ?? false;
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
  // Screen-derived metadata no longer describes the (explicit) status.
  agent.statusReason = null;
  agent.statusEvidence = null;
  agent.visibleBlocker = false;
  agent.lastSeen = new Date().toISOString();
  return changed;
}
