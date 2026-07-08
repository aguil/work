import type { TmuxPane } from "../tmux/client.js";
import * as tmux from "../tmux/client.js";
import type { AgentStatus } from "../workspace/state.js";
import { evaluateMatch } from "./evaluate.js";
import { observePaneWithHerdr } from "./herdr.js";
import { resolveManifestForCli } from "./loader.js";
import {
  buildObservationContext,
  type ObservationContext,
  regionText,
} from "./regions.js";
import type {
  AgentManifest,
  ManifestRule,
  ManifestState,
  ObservationResult,
} from "./types.js";

function mapManifestState(state: ManifestState): AgentStatus {
  switch (state) {
    case "idle":
      return "idle";
    case "working":
    case "thinking":
    case "tool_call":
      return "working";
    case "blocked":
    case "waiting_for_input":
      return "blocked";
    case "done":
      return "done";
    case "error":
      return "error";
    default:
      return "unknown";
  }
}

function confidenceForRegion(
  region: ManifestRule["match"]["region"],
): ObservationResult["confidence"] {
  return region === "pane_title" ? "inferred" : "heuristic";
}

function evaluateRule(ctx: ObservationContext, rule: ManifestRule): boolean {
  const region = rule.match.region ?? "bottom_lines";
  const lines = rule.match.lines ?? 5;
  const text = regionText(ctx, region, lines);
  return evaluateMatch(text, rule.match);
}

export function observeWithManifest(
  ctx: ObservationContext,
  manifest: AgentManifest,
): ObservationResult | null {
  for (const rule of manifest.rules) {
    if (!evaluateRule(ctx, rule)) continue;
    return {
      status: mapManifestState(rule.state),
      confidence: confidenceForRegion(rule.match.region ?? "bottom_lines"),
      manifestState: rule.state,
      rulePriority: rule.priority,
      source: "manifest",
      visibleBlocker: rule.visibleBlocker || undefined,
      visibleIdle: rule.visibleIdle || undefined,
    };
  }
  return null;
}

export function observePane(
  pane: TmuxPane,
  cli: string,
): ObservationResult | null {
  // Prefer the herdr backend when installed: a match wins, an explicit
  // "don't trust this screen" verdict suppresses the update, and silence
  // falls through to the bundled manifests below.
  const herdrResult = observePaneWithHerdr(pane, cli);
  if (herdrResult !== undefined) return herdrResult;

  const manifest = resolveManifestForCli(cli);
  if (!manifest) return null;
  return observeWithManifest(buildObservationContext(pane), manifest);
}

export function observeAgentPane(
  paneId: string,
  cli: string,
): ObservationResult | null {
  const pane = tmux.getPane(paneId);
  if (!pane) return null;
  return observePane(pane, cli);
}
