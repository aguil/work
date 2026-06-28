import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { commandExists, tryCommand, runCommand } from "./exec.js";

export function gitRoot(cwd: string): string | null {
  if (!commandExists("git")) return null;
  return tryCommand("git", ["rev-parse", "--show-toplevel"], { cwd });
}

export function gitBranch(cwd: string): string | null {
  const branch = tryCommand("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    cwd,
  });
  if (!branch || branch === "HEAD") return null;
  return branch;
}

export function gitDirty(cwd: string): boolean {
  const status = tryCommand("git", ["status", "--porcelain"], { cwd });
  return Boolean(status && status.length > 0);
}

export function gitAheadBehind(
  cwd: string,
): { ahead: number; behind: number } | null {
  const upstream = tryCommand("git", ["rev-parse", "--abbrev-ref", "@{upstream}"], {
    cwd,
  });
  if (!upstream) return null;

  const counts = tryCommand(
    "git",
    ["rev-list", "--left-right", "--count", "HEAD...@{upstream}"],
    { cwd },
  );
  if (!counts) return null;

  const [behind, ahead] = counts.split(/\s+/).map((n) => parseInt(n, 10));
  if (Number.isNaN(ahead) || Number.isNaN(behind)) return null;
  return { ahead, behind };
}

export function branchExists(repoPath: string, branch: string): boolean {
  return (
    tryCommand("git", ["show-ref", "--verify", `refs/heads/${branch}`], {
      cwd: repoPath,
    }) !== null
  );
}

export function createGitWorktree(
  repoPath: string,
  destPath: string,
  branch: string,
): void {
  if (!commandExists("git")) {
    throw new Error("git is not installed");
  }

  mkdirSync(dirname(destPath), { recursive: true });

  if (branchExists(repoPath, branch)) {
    runCommand("git", ["-C", repoPath, "worktree", "add", destPath, branch]);
    return;
  }

  runCommand("git", [
    "-C",
    repoPath,
    "worktree",
    "add",
    "-b",
    branch,
    destPath,
    "HEAD",
  ]);
}

export function isGitWorktreeCheckout(path: string): boolean {
  const gitPath = tryCommand("git", ["rev-parse", "--git-path", "HEAD"], {
    cwd: path,
  });
  if (!gitPath) return false;
  return gitPath.includes("/worktrees/");
}

export function repoHasGit(repoPath: string): boolean {
  return existsSync(`${repoPath}/.git`) || gitRoot(repoPath) !== null;
}
