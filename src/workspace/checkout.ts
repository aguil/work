import { existsSync, mkdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { getConfigValue } from "../config/store.js";
import type { WorkspaceState } from "./state.js";
import {
  createCheckout,
  detectRepoBackend,
  resolveTreePath,
} from "../vcs/detect.js";
import { treePathsEqual } from "./trees.js";

export interface ResolvedCheckout {
  path: string;
  createdByWork: boolean;
}

function commonPathPrefix(paths: string[]): string | null {
  if (paths.length === 0) return null;
  const parts = paths.map((p) => resolve(p).split("/").filter(Boolean));
  const common: string[] = [];
  const first = parts[0] ?? [];

  for (let i = 0; i < first.length; i++) {
    const segment = first[i];
    if (parts.every((pathParts) => pathParts[i] === segment)) {
      common.push(segment);
    } else {
      break;
    }
  }

  if (common.length === 0) return null;
  return `/${common.join("/")}`;
}

export function inferCheckoutBase(ws: WorkspaceState): string | null {
  if (ws.trees.length === 0) return null;

  const parents = ws.trees.map((tree) => dirname(resolve(tree.path)));
  const first = parents[0];
  if (parents.every((parent) => parent === first)) {
    return first;
  }

  return commonPathPrefix(ws.trees.map((tree) => tree.path));
}

export function resolveCheckoutBase(ws: WorkspaceState): string {
  const configured = getConfigValue("checkout-base");
  if (configured) return resolve(configured);

  const inferred = inferCheckoutBase(ws);
  if (inferred) return inferred;

  return join(homedir(), "dev", "projects", ws.name);
}

export function resolveWindowCheckout(
  ws: WorkspaceState,
  repoPath: string,
): ResolvedCheckout {
  const repoAbs = resolveTreePath(repoPath);
  const checkoutName = basename(repoAbs);
  const checkoutBase = resolveCheckoutBase(ws);
  mkdirSync(checkoutBase, { recursive: true });
  const destPath = resolve(join(checkoutBase, checkoutName));

  const existingTree = ws.trees.find((tree) =>
    treePathsEqual(tree.path, destPath),
  );
  if (existingTree) {
    return { path: destPath, createdByWork: existingTree.createdByWork };
  }

  if (existsSync(destPath)) {
    return { path: destPath, createdByWork: false };
  }

  if (treePathsEqual(repoAbs, destPath)) {
    return { path: destPath, createdByWork: false };
  }

  const backend = detectRepoBackend(repoAbs);
  createCheckout(backend, repoAbs, destPath, ws.name);
  return { path: destPath, createdByWork: true };
}
