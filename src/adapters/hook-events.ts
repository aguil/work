import type { AgentStatus } from "../workspace/state.js";

export interface AgentHookInput {
  hook_event_name?: string;
  conversation_id?: string;
  session_id?: string;
  cwd?: string;
  tool_name?: string;
  failure_type?: string;
  reason?: string;
  permission?: string;
  workspace_roots?: string[];
  is_interrupt?: boolean;
  [key: string]: unknown;
}

/** @deprecated Use AgentHookInput */
export type CursorHookInput = AgentHookInput;

export function parseHookInput(raw: string): AgentHookInput {
  return JSON.parse(raw) as AgentHookInput;
}

export function resolveConversationId(input: AgentHookInput): string | null {
  const id = input.conversation_id ?? input.session_id;
  if (typeof id === "string" && id.length > 0) return id;
  return null;
}

/** Normalize Cursor camelCase and Claude PascalCase to a single event key. */
export function canonicalHookEventName(name: string): string {
  if (!name) return "unknown";
  return name.charAt(0).toLowerCase() + name.slice(1);
}

export function resolveHookEventName(input: AgentHookInput): string {
  const name = input.hook_event_name;
  if (typeof name === "string" && name.length > 0) {
    return canonicalHookEventName(name);
  }
  return "unknown";
}

/** True when Claude Code cleared or switched sessions but the pane keeps running. */
export function isTransientSessionEnd(input: AgentHookInput): boolean {
  return input.reason === "clear" || input.reason === "resume";
}

/** Map Cursor / Claude Code hook events to work agent status (Tier 1). */
export function mapHookEventToStatus(
  eventName: string,
  input: AgentHookInput,
): AgentStatus | null {
  const event = canonicalHookEventName(eventName);
  switch (event) {
    case "sessionStart":
      return "idle";
    case "sessionEnd":
      if (isTransientSessionEnd(input)) return null;
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
      if (input.is_interrupt === true) return null;
      return "error";
    case "beforeShellExecution":
      // Cursor: only treat as blocked when a hook explicitly requests user review.
      if (input.permission === "ask") return "blocked";
      return null;
    case "beforeMCPExecution":
      if (input.permission === "ask") return "blocked";
      return null;
    case "permissionRequest":
      return "blocked";
    case "permissionDenied":
      return "blocked";
    case "userPromptSubmit":
      return "working";
    case "stop":
      return "idle";
    case "stopFailure":
      return "error";
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
