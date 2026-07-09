import { existsSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import type { TreeRecord } from "../workspace/state.js";
import { commandExists } from "./exec.js";
import * as git from "./git.js";
import * as jj from "./jj.js";

export type VcsType = TreeRecord["vcsType"];

export interface VcsMetadata {
  vcsType: VcsType;
  branch: string | null;
  dirty: boolean;
  ahead: number | null;
  behind: number | null;
  repoRoot: string | null;
}

export interface TreeView extends TreeRecord {
  dirty: boolean;
  ahead: number | null;
  behind: number | null;
  repoRoot: string | null;
  /** jj bookmark vs change-id label (for sidebar coloring). */
  revisionKind?: "bookmark" | "change" | null;
  jjChangePrefix?: string | null;
  jjChangeRest?: string | null;
}

export function resolveTreePath(input: string): string {
  const abs = resolve(input);
  if (!existsSync(abs)) {
    throw new Error(`Path not found: ${input}`);
  }
  return realpathSync(abs);
}

export function resolveDestPath(input: string): string {
  return resolve(input);
}

export function detectVcs(path: string): VcsMetadata {
  const absPath = resolveTreePath(path);

  if (jj.isJjWorkspace(absPath) && commandExists("jj")) {
    const root = jj.jjRoot(absPath) ?? absPath;
    return {
      vcsType: "jj",
      branch: jj.jjBranchLabel(absPath),
      dirty: jj.jjDirty(absPath),
      ahead: null,
      behind: null,
      repoRoot: root,
    };
  }

  const gitRoot = git.gitRoot(absPath);
  if (gitRoot) {
    const aheadBehind = git.gitAheadBehind(absPath);
    return {
      vcsType: "git",
      branch: git.gitBranch(absPath),
      dirty: git.gitDirty(absPath),
      ahead: aheadBehind?.ahead ?? null,
      behind: aheadBehind?.behind ?? null,
      repoRoot: gitRoot,
    };
  }

  return {
    vcsType: "plain",
    branch: null,
    dirty: false,
    ahead: null,
    behind: null,
    repoRoot: null,
  };
}

export function enrichTree(tree: TreeRecord): TreeView {
  try {
    const meta = detectVcs(tree.path);
    const base: TreeView = {
      ...tree,
      vcsType: meta.vcsType,
      branch: meta.branch,
      dirty: meta.dirty,
      ahead: meta.ahead,
      behind: meta.behind,
      repoRoot: meta.repoRoot,
      revisionKind: null,
      jjChangePrefix: null,
      jjChangeRest: null,
    };
    if (meta.vcsType === "jj") {
      const kind = jj.jjRevisionKind(tree.path, meta.branch);
      base.revisionKind = kind;
      if (kind === "change") {
        const parts = jj.jjChangeIdParts(tree.path);
        if (parts) {
          base.jjChangePrefix = parts.prefix;
          base.jjChangeRest = parts.rest;
        } else if (meta.branch && jj.isJjChangeIdLabel(meta.branch)) {
          base.jjChangePrefix = meta.branch.slice(0, 3);
          base.jjChangeRest = meta.branch.slice(3);
        }
      }
    }
    return base;
  } catch {
    return {
      ...tree,
      dirty: false,
      ahead: null,
      behind: null,
      repoRoot: null,
      revisionKind: null,
      jjChangePrefix: null,
      jjChangeRest: null,
    };
  }
}

export function treeContextVars(tree: TreeView): Record<string, string> {
  return {
    TREE_ROOT: tree.path,
    TREE_BRANCH: tree.branch ?? "",
    TREE_VCS: tree.vcsType,
  };
}

export function detectRepoBackend(repoPath: string): "git" | "jj" {
  const absRepo = resolveTreePath(repoPath);
  if (jj.repoHasJj(absRepo) && commandExists("jj")) return "jj";
  if (git.repoHasGit(absRepo)) return "git";
  throw new Error(`No git or jj repository at ${repoPath}`);
}

export function createCheckout(
  backend: "git" | "jj",
  repoPath: string,
  destPath: string,
  branch: string,
): void {
  if (backend === "jj") {
    jj.createJjWorkspace(repoPath, destPath);
    return;
  }
  git.createGitWorktree(repoPath, destPath, branch);
}

export function canRemoveCheckout(
  path: string,
  vcsType: VcsType,
  createdByWork: boolean,
): boolean {
  if (vcsType === "plain") return false;
  if (createdByWork) return true;
  if (vcsType === "git") return git.isGitWorktreeCheckout(path);
  if (vcsType === "jj") return jj.isJjSecondaryWorkspace(path);
  return false;
}

export function removeCheckout(path: string, vcsType: VcsType): void {
  if (vcsType === "git") {
    git.removeGitWorktree(path);
    return;
  }
  if (vcsType === "jj") {
    jj.removeJjWorkspace(path);
    return;
  }
  throw new Error(`Cannot remove plain directory checkout: ${path}`);
}
