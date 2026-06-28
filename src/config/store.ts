import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { paths } from "./paths.js";

export interface Config {
  "agent-clis": string[];
  "auto-track": boolean;
  "repo-scan-dir": string | null;
  "sidebar-width": number;
  "sidebar-position": "left" | "right";
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
  "repo-scan-dir": null,
  "sidebar-width": 40,
  "sidebar-position": "right",
};

type ConfigKey = keyof Config;

let cached: Config | null = null;

function load(): Config {
  if (cached) return cached;
  try {
    const raw = readFileSync(paths.configFile, "utf-8");
    cached = { ...DEFAULTS, ...JSON.parse(raw) } as Config;
  } catch {
    cached = { ...DEFAULTS } as Config;
  }
  return cached!;
}

function save(config: Config): void {
  mkdirSync(dirname(paths.configFile), { recursive: true });
  writeFileSync(paths.configFile, JSON.stringify(config, null, 2) + "\n");
  cached = config;
}

export function getConfig(): Config {
  return load();
}

export function getConfigValue<K extends ConfigKey>(key: K): Config[K] {
  return load()[key];
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
  switch (key as ConfigKey) {
    case "agent-clis":
      return raw.split(",").map((s) => s.trim());
    case "auto-track":
      return raw === "true";
    case "repo-scan-dir":
      return raw === "null" ? null : raw;
    case "sidebar-width":
      return parseInt(raw, 10);
    case "sidebar-position":
      if (raw !== "left" && raw !== "right") {
        throw new Error(`sidebar-position must be "left" or "right"`);
      }
      return raw;
    default:
      return undefined;
  }
}

export function resetCache(): void {
  cached = null;
}
