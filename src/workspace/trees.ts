import {
  saveWorkspace,
  type TreeRecord,
  type WorkspaceState,
} from "./state.js";
import { detectVcs, resolveTreePath } from "../vcs/detect.js";
import { resolve } from "node:path";

export function treePathsEqual(a: string, b: string): boolean {
  try {
    return resolveTreePath(a) === resolveTreePath(b);
  } catch {
    return resolve(a) === resolve(b);
  }
}

export function findTreeIndex(ws: WorkspaceState, path: string): number {
  return ws.trees.findIndex((tree) => treePathsEqual(tree.path, path));
}

export function addTreeToWorkspace(
  ws: WorkspaceState,
  path: string,
  createdByWorkctl: boolean,
): TreeRecord {
  const absPath = resolveTreePath(path);
  if (findTreeIndex(ws, absPath) >= 0) {
    throw new Error(`Tree already associated: ${absPath}`);
  }

  const meta = detectVcs(absPath);
  const record: TreeRecord = {
    path: absPath,
    vcsType: meta.vcsType,
    branch: meta.branch,
    createdByWorkctl,
  };
  ws.trees.push(record);
  saveWorkspace(ws);
  return record;
}

export function ensureTreeInWorkspace(
  ws: WorkspaceState,
  path: string,
  createdByWorkctl: boolean,
): TreeRecord {
  const absPath = resolveTreePath(path);
  const idx = findTreeIndex(ws, absPath);
  if (idx >= 0) return ws.trees[idx];
  return addTreeToWorkspace(ws, absPath, createdByWorkctl);
}
