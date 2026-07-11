import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { paths } from "./paths.js";

export interface Config {
  "agent-clis": string[];
  "auto-track": boolean;
  "prompt-repos-on-new-window": boolean;
  "repo-scan-dir": string[];
  "checkout-base": string | null;
  "sidebar-width": number;
  "sidebar-position": "left" | "right";
  /** tmux choose-session / choose-tree shortcut labels (0-based index → char). */
  "session-shortcut-keys": string;
  /** id: $N-1 (default). choose-order: position in choose-tree -s list (-O index). */
  "session-shortcut-index": "id" | "choose-order";
}

const DEFAULTS: Config = {
  "agent-clis": [
    "agent", // Cursor CLI (cursor.com/docs/cli)
    "cursor",
    "cursor-agent",
    "claude",
    "codex",
    "opencode",
  ],
  "auto-track": false,
  "prompt-repos-on-new-window": false,
  "repo-scan-dir": [],
  "checkout-base": null,
  "sidebar-width": 40,
  "sidebar-position": "right",
  "session-shortcut-keys": "0123456789abcdefghijklmnopqrstuvwxyz",
  "session-shortcut-index": "id",
};

type ConfigKey = keyof Config;

const REMOVED_CONFIG_KEYS = [
  "prompt-actions-on-new",
  "prompt-repos-on-new",
] as const;

let cached: Config | null = null;

function normalizeRepoScanDir(value: unknown): string[] {
  if (value == null || value === "") return [];
  if (Array.isArray(value)) {
    return value.map(String).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeLoaded(raw: Record<string, unknown>): {
  config: Config;
  dirty: boolean;
} {
  let dirty = false;
  const merged: Record<string, unknown> = { ...DEFAULTS, ...raw };

  for (const key of REMOVED_CONFIG_KEYS) {
    if (key in raw) {
      delete merged[key];
      dirty = true;
    }
  }

  const scanDir = normalizeRepoScanDir(raw["repo-scan-dir"]);
  if (JSON.stringify(scanDir) !== JSON.stringify(raw["repo-scan-dir"])) {
    dirty = true;
  }
  merged["repo-scan-dir"] = scanDir;

  return { config: merged as unknown as Config, dirty };
}

function load(): Config {
  if (cached) return cached;
  try {
    const raw = JSON.parse(readFileSync(paths.configFile, "utf-8")) as Record<
      string,
      unknown
    >;
    const { config, dirty } = normalizeLoaded(raw);
    cached = config;
    if (dirty) {
      save(config);
    }
  } catch {
    cached = { ...DEFAULTS };
  }
  return cached;
}

function save(config: Config): void {
  mkdirSync(dirname(paths.configFile), { recursive: true });
  writeFileSync(paths.configFile, `${JSON.stringify(config, null, 2)}\n`);
  cached = config;
}

export function getConfig(): Config {
  return load();
}

export function getConfigValue<K extends ConfigKey>(key: K): Config[K] {
  return load()[key];
}

export function getRepoScanDirs(): string[] {
  return getConfigValue("repo-scan-dir");
}

export function setConfigValue<K extends ConfigKey>(
  key: K,
  value: Config[K],
): void {
  const config = load();
  config[key] = value;
  save(config);
}

export function parseConfigValue(
  key: string,
  raw: string,
): Config[ConfigKey] | undefined {
  if ((REMOVED_CONFIG_KEYS as readonly string[]).includes(key)) {
    return undefined;
  }

  switch (key as ConfigKey) {
    case "agent-clis":
      return raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    case "auto-track":
      return raw === "true";
    case "prompt-repos-on-new-window":
      return raw === "true";
    case "repo-scan-dir":
      if (raw === "null" || raw === "") return [];
      return raw
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
    case "checkout-base":
      return raw === "null" ? null : raw;
    case "sidebar-width":
      return parseInt(raw, 10);
    case "sidebar-position":
      if (raw !== "left" && raw !== "right") {
        throw new Error(`sidebar-position must be "left" or "right"`);
      }
      return raw;
    case "session-shortcut-keys":
      if (!raw) {
        throw new Error("session-shortcut-keys must be a non-empty string");
      }
      return raw;
    default:
      return undefined;
  }
}

export function resetCache(): void {
  cached = null;
}
