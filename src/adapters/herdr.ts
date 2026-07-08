import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { accessSync, constants, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import type { TmuxPane } from "../tmux/client.js";
import * as tmux from "../tmux/client.js";
import type { ObservationResult } from "./types.js";

/**
 * Optional Tier 2 detection backend that delegates screen heuristics to a
 * locally installed herdr binary (https://herdr.dev). herdr ships maintained,
 * remotely updated detection manifests for ~18 agent CLIs; `herdr agent
 * explain --file` evaluates a screen snapshot without a running herdr server.
 *
 * Enabled automatically when `herdr` is on PATH. Override the binary with
 * WORK_HERDR_BIN=/path/to/herdr, or disable with WORK_HERDR_BIN=off.
 */

// Keep well under workd's 2s poll interval: explain calls are synchronous
// and a slow herdr binary must not stall the daemon for a whole tick.
const EXPLAIN_TIMEOUT_MS = 500;

// After a failure, pause the backend instead of disabling it permanently.
// Long-lived processes (workd) recover from transient hiccups this way.
const FAILURE_RETRY_MS = 30_000;

/** Map work agent CLI names to herdr agent labels. */
const CLI_TO_HERDR_LABEL: Record<string, string> = {
  agent: "cursor", // Cursor CLI installs its binary as `agent`
};

export interface HerdrExplainResult {
  state: string;
  matchedRuleId: string | null;
  matchedRulePriority: number | null;
  skipStateUpdate: boolean;
  unknownAgent: boolean;
  visibleBlocker: boolean;
  visibleIdle: boolean;
  evidence: string | null;
}

let cachedBin: string | null | undefined;
let failedUntil = 0;
const unsupportedLabels = new Set<string>();

interface ExplainCacheEntry {
  screenHash: string;
  result: HerdrExplainResult;
}

/** Per-pane explain cache keyed by pane id + herdr agent label. */
const explainCache = new Map<string, ExplainCacheEntry>();

function normalizedScreen(screen: string): string {
  return screen
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n");
}

function screenHash(screen: string): string {
  return createHash("sha256")
    .update(normalizedScreen(screen))
    .digest("hex")
    .slice(0, 16);
}

function explainCacheKey(paneId: string, label: string): string {
  return `${paneId}:${label}`;
}

function isDisabledValue(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    normalized === "" ||
    normalized === "off" ||
    normalized === "0" ||
    normalized === "false"
  );
}

function findOnPath(name: string): string | null {
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    if (!dir) continue;
    const candidate = join(dir, name);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // not here; keep looking
    }
  }
  return null;
}

export function resolveHerdrBin(): string | null {
  if (cachedBin !== undefined) return cachedBin;

  const override = process.env.WORK_HERDR_BIN;
  if (override !== undefined) {
    cachedBin = isDisabledValue(override) ? null : override.trim();
    return cachedBin;
  }

  cachedBin = findOnPath("herdr");
  return cachedBin;
}

export function resetHerdrCache(): void {
  cachedBin = undefined;
  failedUntil = 0;
  unsupportedLabels.clear();
  explainCache.clear();
}

/** Process names to search when resolving agent child processes. */
export function agentProcessNames(cli: string): string[] {
  const normalized = cli.trim().toLowerCase();
  const names = new Set<string>([normalized, herdrAgentLabel(normalized)]);
  if (
    normalized === "agent" ||
    normalized === "cursor" ||
    normalized === "cursor-agent"
  ) {
    names.add("agent");
    names.add("cursor");
    names.add("cursor-agent");
  }
  if (normalized === "claude") {
    names.add("claude-code");
  }
  return [...names];
}

export function herdrAgentLabel(cli: string): string {
  const normalized = cli.trim().toLowerCase();
  return CLI_TO_HERDR_LABEL[normalized] ?? normalized;
}

function runExplain(
  bin: string,
  screen: string,
  label: string,
): HerdrExplainResult | null {
  const snapshot = join(
    tmpdir(),
    `work-herdr-${process.pid}-${Math.random().toString(36).slice(2)}.txt`,
  );
  try {
    writeFileSync(snapshot, screen, { mode: 0o600 });
    const raw = execFileSync(
      bin,
      ["agent", "explain", "--file", snapshot, "--agent", label, "--json"],
      {
        encoding: "utf-8",
        timeout: EXPLAIN_TIMEOUT_MS,
        stdio: ["ignore", "pipe", "ignore"],
      },
    );
    const parsed = JSON.parse(raw) as {
      state?: string;
      skip_state_update?: boolean;
      fallback_reason?: string | null;
      matched_rule?: { id?: string; priority?: number } | null;
      visible_blocker?: boolean;
      visible_idle?: boolean;
      evaluated_rules?: Array<{
        id?: string;
        evidence?: { region_preview?: string };
      }>;
    };
    failedUntil = 0;
    const matchedId = parsed.matched_rule?.id ?? null;
    return {
      state: typeof parsed.state === "string" ? parsed.state : "unknown",
      matchedRuleId: matchedId,
      matchedRulePriority: parsed.matched_rule?.priority ?? null,
      skipStateUpdate: parsed.skip_state_update === true,
      unknownAgent: parsed.fallback_reason === "unknown_agent",
      visibleBlocker: parsed.visible_blocker === true,
      visibleIdle: parsed.visible_idle === true,
      evidence: matchedId
        ? evidenceSnippet(parsed.evaluated_rules, matchedId)
        : null,
    };
  } catch {
    // herdr missing, incompatible, or timed out — pause and retry later so a
    // transient hiccup doesn't disable the backend for a long-lived daemon.
    failedUntil = Date.now() + FAILURE_RETRY_MS;
    return null;
  } finally {
    try {
      unlinkSync(snapshot);
    } catch {
      // best effort
    }
  }
}

const EVIDENCE_MAX_CHARS = 160;

/** First non-empty line of the matched rule's region preview, bounded. */
function evidenceSnippet(
  evaluatedRules:
    | Array<{ id?: string; evidence?: { region_preview?: string } }>
    | undefined,
  matchedRuleId: string,
): string | null {
  const entry = evaluatedRules?.find((rule) => rule.id === matchedRuleId);
  const preview = entry?.evidence?.region_preview;
  if (!preview) return null;
  const line = preview
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!line) return null;
  return line.length > EVIDENCE_MAX_CHARS
    ? `${line.slice(0, EVIDENCE_MAX_CHARS)}…`
    : line;
}

type HerdrUsableState = "idle" | "working" | "blocked";

function mapHerdrState(state: string): HerdrUsableState | null {
  switch (state) {
    case "idle":
    case "working":
    case "blocked":
      return state;
    default:
      return null;
  }
}

function toObservationResult(
  result: HerdrExplainResult,
): ObservationResult | null | undefined {
  if (result.skipStateUpdate) return null;
  if (result.matchedRulePriority == null) return undefined;

  const status = mapHerdrState(result.state);
  if (!status) return undefined;

  return {
    status,
    confidence: "heuristic",
    manifestState: status,
    rulePriority: result.matchedRulePriority,
    source: "herdr",
    ruleId: result.matchedRuleId ?? undefined,
    visibleBlocker: result.visibleBlocker || undefined,
    visibleIdle: result.visibleIdle || undefined,
    evidence: result.evidence ?? undefined,
  };
}

/**
 * Run herdr explain for a screen snapshot, reusing the last verdict when the
 * pane content is unchanged. Returns undefined when herdr is unavailable.
 */
function explainScreenCached(
  paneId: string,
  screen: string,
  cli: string,
): HerdrExplainResult | null | undefined {
  const bin = resolveHerdrBin();
  if (!bin) return undefined;
  if (failedUntil > Date.now()) return undefined;

  const label = herdrAgentLabel(cli);
  if (unsupportedLabels.has(label)) return undefined;

  const hash = screenHash(screen);
  const cacheKey = explainCacheKey(paneId, label);
  const cached = explainCache.get(cacheKey);
  if (cached?.screenHash === hash) {
    return cached.result;
  }

  const result = runExplain(bin, screen, label);
  if (!result) return undefined;

  if (result.unknownAgent) {
    unsupportedLabels.add(label);
    return undefined;
  }

  explainCache.set(cacheKey, { screenHash: hash, result });
  return result;
}

/** True when herdr sees agent-owned UI on the pane (rule match or viewer). */
export function hasHerdrScreenEvidence(pane: TmuxPane, cli: string): boolean {
  const screen = tmux.capturePane(pane.id);
  const result = explainScreenCached(pane.id, screen, cli);
  if (!result) return false;
  return result.matchedRulePriority != null || result.skipStateUpdate;
}

/**
 * Evaluate a pane snapshot with herdr.
 *
 * Returns:
 * - an ObservationResult when a herdr rule matched with a usable state,
 * - null when herdr matched but the screen must not drive a state update
 *   (e.g. an agent-owned transcript viewer is showing stale prompts),
 * - undefined when herdr is unavailable or silent, so the caller should
 *   fall back to work's bundled manifests.
 */
export function observePaneWithHerdr(
  pane: TmuxPane,
  cli: string,
): ObservationResult | null | undefined {
  const screen = tmux.capturePane(pane.id);
  const result = explainScreenCached(pane.id, screen, cli);
  if (!result) return undefined;
  return toObservationResult(result);
}
