import type { AgentStatus } from "../workspace/state.js";

export interface CursorHookInput {
  hook_event_name?: string;
  conversation_id?: string;
  session_id?: string;
  cwd?: string;
  tool_name?: string;
  failure_type?: string;
  reason?: string;
  permission?: string;
  workspace_roots?: string[];
  [key: string]: unknown;
}

export function parseHookInput(raw: string): CursorHookInput {
  return JSON.parse(raw) as CursorHookInput;
}

export function resolveConversationId(input: CursorHookInput): string | null {
  const id = input.conversation_id ?? input.session_id;
  if (typeof id === "string" && id.length > 0) return id;
  return null;
}

export function resolveHookEventName(input: CursorHookInput): string {
  const name = input.hook_event_name;
  if (typeof name === "string" && name.length > 0) return name;
  return "unknown";
}

/** Map Cursor hook events to work agent status (Tier 1). */
export function mapHookEventToStatus(
  eventName: string,
  input: CursorHookInput,
): AgentStatus | null {
  switch (eventName) {
    case "sessionStart":
      return "idle";
    case "sessionEnd":
      if (input.reason === "error") return "error";
      if (input.reason === "completed") return "done";
      return "idle";
    case "preToolUse":
      return "working";
    case "postToolUse":
      // Tool finished; agent may invoke more tools before the turn ends.
      return null;
    case "postToolUseFailure":
      if (input.failure_type === "permission_denied") return "blocked";
      return "error";
    case "beforeShellExecution":
      // Only treat as blocked when a hook explicitly requests user review.
      if (input.permission === "ask") return "blocked";
      return null;
    case "beforeMCPExecution":
      if (input.permission === "ask") return "blocked";
      return null;
    case "stop":
      return "idle";
    case "afterAgentResponse":
      return "idle";
    case "afterAgentThought":
      return "working";
    case "subagentStart":
      return "working";
    case "subagentStop":
      // Subagent finished; parent agent may still be working.
      return null;
    default:
      return null;
  }
}
