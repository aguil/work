import { existsSync, mkdirSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { commandExists, runCommand, tryCommand } from "./exec.js";

export function jjRoot(cwd: string): string | null {
  if (!commandExists("jj")) return null;
  return tryCommand("jj", ["root"], { cwd });
}

export function isJjWorkspace(path: string): boolean {
  return existsSync(`${path}/.jj/working_copy`);
}

function parseBookmarkNames(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(/\s+/)
    .map((b) => b.trim())
    .filter(Boolean);
}

function jjRevBookmark(cwd: string, rev: string): string | null {
  const bookmarks = tryCommand(
    "jj",
    [
      "log",
      "-r",
      rev,
      "-T",
      "bookmarks",
      "--no-graph",
      "--ignore-working-copy",
    ],
    { cwd },
  );
  return parseBookmarkNames(bookmarks)[0] ?? null;
}

export function jjBookmark(cwd: string): string | null {
  return jjRevBookmark(cwd, "@");
}

export function jjChangeId(cwd: string, rev = "@"): string | null {
  return tryCommand(
    "jj",
    [
      "log",
      "-r",
      rev,
      "-T",
      "change_id.short()",
      "--no-graph",
      "--ignore-working-copy",
    ],
    { cwd },
  );
}

export function jjWorkingCopyClean(cwd: string): boolean {
  const status = tryCommand("jj", ["status"], { cwd });
  if (!status) return true;
  return /The working copy has no changes\./m.test(status);
}

export function jjChangeIdParts(
  cwd: string,
  rev = "@",
): { prefix: string; rest: string } | null {
  const raw = tryCommand(
    "jj",
    [
      "log",
      "-r",
      rev,
      "-T",
      'change_id.shortest().prefix() ++ "\\t" ++ change_id.shortest().rest()',
      "--no-graph",
      "--ignore-working-copy",
    ],
    { cwd },
  );
  if (!raw) return null;
  const tab = raw.indexOf("\t");
  if (tab === -1) {
    return { prefix: raw, rest: "" };
  }
  return { prefix: raw.slice(0, tab), rest: raw.slice(tab + 1) };
}

export function isJjChangeIdLabel(label: string): boolean {
  return /^[a-z][a-z0-9]{6,15}$/.test(label);
}

export function jjRevisionKind(
  cwd: string,
  branchLabel?: string | null,
): "bookmark" | "change" | null {
  const bookmark = jjBookmark(cwd);
  if (bookmark) return "bookmark";
  if (branchLabel && !isJjChangeIdLabel(branchLabel)) return "bookmark";
  const parts = jjChangeIdParts(cwd);
  if (parts && (parts.prefix || parts.rest)) return "change";
  return null;
}

export function jjBranchLabel(cwd: string): string | null {
  const bookmark = jjBookmark(cwd);
  if (bookmark) return bookmark;

  if (jjWorkingCopyClean(cwd)) {
    const parentBookmark = jjRevBookmark(cwd, "@-");
    if (parentBookmark) return parentBookmark;
    return jjChangeId(cwd, "@-") ?? jjChangeId(cwd, "@");
  }

  return jjChangeId(cwd, "@");
}

export function jjDirty(cwd: string): boolean {
  const status = tryCommand("jj", ["status"], { cwd });
  if (!status) return false;
  return /Working copy changes:/m.test(status);
}

export function createJjWorkspace(repoPath: string, destPath: string): void {
  if (!commandExists("jj")) {
    throw new Error("jj is not installed");
  }

  mkdirSync(dirname(destPath), { recursive: true });
  runCommand("jj", ["workspace", "add", destPath], { cwd: repoPath });
}

export function isJjSecondaryWorkspace(path: string): boolean {
  if (!isJjWorkspace(path)) return false;
  const root = jjRoot(path);
  if (!root) return false;
  return resolve(path) !== resolve(root);
}

export function jjHasCommitsNotIn(cwd: string, bookmark: string): boolean {
  const out = tryCommand(
    "jj",
    [
      "log",
      "-r",
      `@ ~ ${bookmark}`,
      "--limit",
      "1",
      "-T",
      "change_id",
      "--no-graph",
      "--ignore-working-copy",
    ],
    { cwd },
  );
  return Boolean(out);
}

export function jjDefaultBookmark(cwd: string): string | null {
  for (const name of ["main", "master", "trunk"]) {
    const exists = tryCommand(
      "jj",
      [
        "log",
        "-r",
        name,
        "--limit",
        "1",
        "-T",
        "commit_id",
        "--no-graph",
        "--ignore-working-copy",
      ],
      { cwd },
    );
    if (exists) return name;
  }
  return null;
}

export function repoHasJj(repoPath: string): boolean {
  return existsSync(`${repoPath}/.jj`);
}

export function removeJjWorkspace(workspacePath: string): void {
  if (!commandExists("jj")) {
    throw new Error("jj is not installed");
  }

  const root = jjRoot(workspacePath);
  if (!root) {
    throw new Error(`Not a jj workspace: ${workspacePath}`);
  }

  runCommand("jj", ["workspace", "forget", basename(workspacePath)], {
    cwd: root,
  });
}
