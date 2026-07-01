import { type Dirent, existsSync, readdirSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
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

const SKIP_DIR_NAMES = new Set([
  "node_modules",
  ".git",
  ".jj",
  ".cache",
  "dist",
  "build",
  "target",
  "vendor",
]);

export function scanRepoDirectory(dir: string, maxDepth = 4): ScannedRepo[] {
  const absDir = resolve(dir);
  if (!existsSync(absDir)) {
    throw new Error(`Repo scan directory not found: ${dir}`);
  }

  const repos: ScannedRepo[] = [];
  const seen = new Set<string>();

  function addRepo(path: string, vcsType: "git" | "jj"): void {
    const normalized = resolve(path);
    if (seen.has(normalized)) return;
    seen.add(normalized);
    repos.push({
      name: relative(absDir, normalized) || basename(normalized),
      path: normalized,
      vcsType,
    });
  }

  function walk(current: string, depth: number): void {
    if (depth > maxDepth) return;

    const vcsType = isRepoDir(current);
    if (vcsType) {
      addRepo(current, vcsType);
      return;
    }

    let entries: Dirent[];
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".")) continue;
      if (SKIP_DIR_NAMES.has(entry.name)) continue;
      walk(join(current, entry.name), depth + 1);
    }
  }

  walk(absDir, 0);
  return repos.sort((a, b) => a.name.localeCompare(b.name));
}

export function scanRepoDirectories(
  dirs: string[],
  maxDepth = 4,
): ScannedRepo[] {
  const repos: ScannedRepo[] = [];
  const seen = new Set<string>();

  for (const dir of dirs) {
    for (const repo of scanRepoDirectory(dir, maxDepth)) {
      if (seen.has(repo.path)) continue;
      seen.add(repo.path);
      repos.push(repo);
    }
  }

  return repos.sort((a, b) => a.path.localeCompare(b.path));
}

export function resolveRepoPaths(
  raw: string,
  scanDirs: string[],
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

  if (repos.length === 0 && scanDirs.length > 0) {
    throw new Error("No repositories specified");
  }

  return repos;
}
