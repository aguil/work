import type { TreeView } from "../vcs/detect.js";
import { isJjChangeIdLabel } from "../vcs/jj.js";

/** jj log colors: bold bright-magenta prefix, dim rest, bright-magenta bookmarks. */
const JJ_PREFIX = "\x1b[1;95m";
const JJ_BOOKMARK = "\x1b[95m";
const JJ_REST = "\x1b[90m";
const RESET = "\x1b[0m";

/** jj `prefix` bold + `rest` dim, matching default log colors. */
export function coloredJjChangeId(prefix: string, rest: string): string {
  if (!prefix && !rest) return "";
  if (!rest) {
    return `${JJ_PREFIX}${prefix}${RESET}`;
  }
  return `${JJ_PREFIX}${prefix}${RESET}${JJ_REST}${rest}${RESET}`;
}

export function coloredJjBookmark(name: string): string {
  return `${JJ_BOOKMARK}${name}${RESET}`;
}

function jjChangeParts(
  tree: TreeView,
): { prefix: string; rest: string } | null {
  const branch = tree.branch?.trim();
  if (!branch || !isJjChangeIdLabel(branch)) return null;

  const prefix = tree.jjChangePrefix?.trim() ?? "";
  if (prefix) {
    const rest = tree.jjChangeRest?.trim() || branch.slice(prefix.length);
    return { prefix, rest };
  }

  // Fallback: first 3 chars as prefix (jj often shows 3-char unique prefix)
  return { prefix: branch.slice(0, 3), rest: branch.slice(3) };
}

export function formatRevisionLabel(tree: TreeView): string {
  if (tree.vcsType === "jj" && tree.branch?.trim()) {
    const branch = tree.branch.trim();
    if (tree.revisionKind === "bookmark" || !isJjChangeIdLabel(branch)) {
      return coloredJjBookmark(branch);
    }
    const parts = jjChangeParts(tree);
    if (parts) {
      return coloredJjChangeId(parts.prefix, parts.rest);
    }
  }
  if (tree.branch) {
    return `${JJ_REST}${tree.branch}${RESET}`;
  }
  return "";
}
