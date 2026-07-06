import type { AgentStatus } from "../workspace/state.js";

export type ManifestState =
  | "idle"
  | "working"
  | "thinking"
  | "tool_call"
  | "waiting_for_input"
  | "blocked"
  | "done"
  | "error";

export type MatchRegion = "pane_title" | "bottom_lines";

export interface MatchExpr {
  contains?: string[];
  regex?: string[];
  line_regex?: string[];
  all?: MatchExpr[];
  any?: MatchExpr[];
  not?: MatchExpr;
}

export interface ManifestRule {
  priority: number;
  state: ManifestState;
  visibleBlocker?: boolean;
  visibleIdle?: boolean;
  match: MatchExpr & {
    region?: MatchRegion;
    lines?: number;
  };
}

export interface AgentManifest {
  agent: string;
  processNames: string[];
  rules: ManifestRule[];
  source: string;
}

export interface ObservationResult {
  status: AgentStatus;
  confidence: "inferred" | "heuristic" | "none";
  manifestState: ManifestState;
  rulePriority: number;
  /** Which detection backend produced this result. */
  source?: "manifest" | "herdr";
}
