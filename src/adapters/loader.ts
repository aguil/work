import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import TOML from "smol-toml";
import { paths } from "../config/paths.js";
import type { AgentManifest, ManifestRule, MatchExpr } from "./types.js";

const bundledDir = join(dirname(fileURLToPath(import.meta.url)), "manifests");

interface RawManifest {
  agent?: string;
  process_names?: string[];
  rules?: RawRule[];
}

interface RawRule {
  priority?: number;
  state?: string;
  visible_blocker?: boolean;
  visible_idle?: boolean;
  match?: RawMatch;
}

interface RawMatch extends MatchExpr {
  region?: string;
  lines?: number;
}

function parseMatch(raw: RawMatch | undefined): ManifestRule["match"] {
  if (!raw) return { region: "bottom_lines", lines: 5 };
  const region = raw.region === "pane_title" ? "pane_title" : "bottom_lines";
  return {
    region,
    lines: raw.lines ?? 5,
    contains: raw.contains,
    regex: raw.regex,
    line_regex: raw.line_regex,
    all: raw.all?.map((entry) => parseMatch(entry)),
    any: raw.any?.map((entry) => parseMatch(entry)),
    not: raw.not ? parseMatch(raw.not) : undefined,
  };
}

function parseManifestFile(filePath: string): AgentManifest | null {
  let raw: RawManifest;
  try {
    raw = TOML.parse(readFileSync(filePath, "utf-8")) as RawManifest;
  } catch {
    return null;
  }

  const agent = raw.agent?.trim();
  if (!agent) return null;

  const processNames = (raw.process_names ?? [agent])
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);

  const rules: ManifestRule[] = [];
  for (const rule of raw.rules ?? []) {
    const state = rule.state?.trim();
    if (!state) continue;
    rules.push({
      priority: rule.priority ?? 0,
      state: state as ManifestRule["state"],
      visibleBlocker: rule.visible_blocker,
      visibleIdle: rule.visible_idle,
      match: parseMatch(rule.match),
    });
  }
  rules.sort((a, b) => b.priority - a.priority);

  return {
    agent,
    processNames,
    rules,
    source: filePath,
  };
}

function loadBundledManifests(): AgentManifest[] {
  if (!existsSync(bundledDir)) return [];
  return readdirSync(bundledDir)
    .filter((file) => file.endsWith(".toml"))
    .map((file) => parseManifestFile(join(bundledDir, file)))
    .filter((manifest): manifest is AgentManifest => manifest != null);
}

function loadUserManifests(): AgentManifest[] {
  const dir = paths.manifestsDir;
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((file) => file.endsWith(".toml"))
    .map((file) => parseManifestFile(join(dir, file)))
    .filter((manifest): manifest is AgentManifest => manifest != null);
}

let cached: Map<string, AgentManifest> | null = null;

export function loadManifests(): Map<string, AgentManifest> {
  if (cached) return cached;

  const byAgent = new Map<string, AgentManifest>();
  for (const manifest of loadBundledManifests()) {
    byAgent.set(manifest.agent, manifest);
  }
  for (const manifest of loadUserManifests()) {
    byAgent.set(manifest.agent, manifest);
  }

  cached = byAgent;
  return byAgent;
}

export function resetManifestCache(): void {
  cached = null;
}

export function resolveManifestForCli(cli: string): AgentManifest | null {
  const normalized = cli.trim().toLowerCase();
  for (const manifest of loadManifests().values()) {
    if (manifest.processNames.includes(normalized)) {
      return manifest;
    }
  }
  return null;
}

export function listManifests(): AgentManifest[] {
  return [...loadManifests().values()].sort((a, b) =>
    a.agent.localeCompare(b.agent),
  );
}

export function manifestBasename(source: string): string {
  return basename(source);
}
