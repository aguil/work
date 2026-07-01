import { type Dirent, existsSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { getConfigValue } from "../config/store.js";
import { isSidebarPane } from "../scanner/detect.js";
import type { TmuxPane } from "../tmux/client.js";
import { detectVcs, resolveTreePath } from "../vcs/detect.js";
import { inferCheckoutBase, resolveCheckoutBase } from "./checkout.js";
import type { WorkspaceState } from "./state.js";

function checkoutPathFromCwd(cwd: string): string | null {
  if (!cwd) return null;
  try {
    const meta = detectVcs(cwd);
    if (meta.vcsType === "plain") return null;
    return resolveTreePath(cwd);
  } catch {
    return null;
  }
}

export function discoverTreesFromPanes(panes: TmuxPane[]): string[] {
  const paths = new Set<string>();
  for (const pane of panes) {
    if (isSidebarPane(pane)) continue;
    const checkout = checkoutPathFromCwd(pane.currentPath);
    if (checkout) paths.add(checkout);
  }
  return [...paths];
}

/**
 * Checkout-base sibling scan is for project layouts (e.g. ~/dev/projects/tmuxr/*),
 * not arbitrary parents like ~/.local/share when a single chezmoi tree is tracked.
 */
export function checkoutBaseForDiscovery(ws: WorkspaceState): string | null {
  const configured = getConfigValue("checkout-base");
  if (configured) return resolve(configured);

  if (ws.createdByWork) return resolveCheckoutBase(ws);

  if (ws.trees.length < 2) return null;

  const inferred = inferCheckoutBase(ws);
  if (!inferred) return null;

  if (basename(inferred) === ws.name) return inferred;

  return null;
}

/** Scan direct children of the workspace checkout base (same layout as window use-repo). */
export function discoverTreesFromCheckoutBase(checkoutBase: string): string[] {
  if (!existsSync(checkoutBase)) return [];

  const paths = new Set<string>();
  let entries: Dirent[];
  try {
    entries = readdirSync(checkoutBase, { withFileTypes: true });
  } catch {
    return [];
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".")) continue;
    const child = join(checkoutBase, entry.name);
    try {
      const meta = detectVcs(child);
      if (meta.vcsType !== "plain") {
        paths.add(resolveTreePath(child));
      }
    } catch {
      // skip unreadable or missing paths
    }
  }

  return [...paths];
}

export function discoverSessionTreePaths(
  ws: WorkspaceState,
  panes: TmuxPane[],
): string[] {
  const paths = new Set<string>();
  for (const path of discoverTreesFromPanes(panes)) {
    paths.add(path);
  }
  const checkoutBase = checkoutBaseForDiscovery(ws);
  if (checkoutBase) {
    for (const path of discoverTreesFromCheckoutBase(checkoutBase)) {
      paths.add(path);
    }
  }
  return [...paths].sort();
}
