import { execFileSync } from "node:child_process";
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

const EXPLAIN_TIMEOUT_MS = 2000;

/** Map work agent CLI names to herdr agent labels. */
const CLI_TO_HERDR_LABEL: Record<string, string> = {
  agent: "cursor", // Cursor CLI installs its binary as `agent`
};

export interface HerdrExplainResult {
  state: string;
  matchedRulePriority: number | null;
  skipStateUpdate: boolean;
  unknownAgent: boolean;
}

let cachedBin: string | null | undefined;
const unsupportedLabels = new Set<string>();

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
  unsupportedLabels.clear();
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
      matched_rule?: { priority?: number } | null;
    };
    return {
      state: typeof parsed.state === "string" ? parsed.state : "unknown",
      matchedRulePriority: parsed.matched_rule?.priority ?? null,
      skipStateUpdate: parsed.skip_state_update === true,
      unknownAgent: parsed.fallback_reason === "unknown_agent",
    };
  } catch {
    // herdr missing, incompatible, or timed out — disable for this process.
    cachedBin = null;
    return null;
  } finally {
    try {
      unlinkSync(snapshot);
    } catch {
      // best effort
    }
  }
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
  const bin = resolveHerdrBin();
  if (!bin) return undefined;

  const label = herdrAgentLabel(cli);
  if (unsupportedLabels.has(label)) return undefined;

  const screen = tmux.capturePane(pane.id);
  const result = runExplain(bin, screen, label);
  if (!result) return undefined;

  if (result.unknownAgent) {
    unsupportedLabels.add(label);
    return undefined;
  }

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
  };
}
