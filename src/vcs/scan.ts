import { existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { commandExists } from "./exec.js";
import * as git from "./git.js";
import * as jj from "./jj.js";

export interface ScannedRepo {
  name: string;
  path: string;
  vcsType: "git" | "jj";
}

function isRepoDir(path: string): "git" | "jj" | null {
  if (jj.repoHasJj(path) && commandExists("jj")) return "jj";
  if (git.repoHasGit(path)) return "git";
  return null;
}

export function scanRepoDirectory(dir: string): ScannedRepo[] {
  const absDir = resolve(dir);
  if (!existsSync(absDir)) {
    throw new Error(`Repo scan directory not found: ${dir}`);
  }

  const entries = readdirSync(absDir, { withFileTypes: true });
  const repos: ScannedRepo[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const path = join(absDir, entry.name);
    try {
      if (!statSync(path).isDirectory()) continue;
    } catch {
      continue;
    }

    const vcsType = isRepoDir(path);
    if (!vcsType) continue;

    repos.push({
      name: entry.name,
      path,
      vcsType,
    });
  }

  return repos.sort((a, b) => a.name.localeCompare(b.name));
}

export function resolveRepoPaths(
  raw: string,
  scanDir: string | null,
): ScannedRepo[] {
  const paths = raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  const repos: ScannedRepo[] = [];
  for (const input of paths) {
    const abs = resolve(input);
    if (!existsSync(abs)) {
      throw new Error(`Repository path not found: ${input}`);
    }

    const vcsType = isRepoDir(abs);
    if (!vcsType) {
      throw new Error(`No git or jj repository at ${input}`);
    }

    repos.push({
      name: abs.split("/").pop() ?? abs,
      path: abs,
      vcsType,
    });
  }

  if (repos.length === 0 && scanDir) {
    throw new Error("No repositories specified");
  }

  return repos;
}
