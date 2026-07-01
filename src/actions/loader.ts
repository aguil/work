import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import TOML from "smol-toml";
import { paths } from "../config/paths.js";
import { isPathTrusted } from "../config/trust.js";
import { enrichTree } from "../vcs/detect.js";
import type { WorkspaceState } from "../workspace/state.js";
import type { ActionDefinition } from "./types.js";

const REPO_ACTIONS_DIR = ".work/actions";

interface RawActionToml {
  name?: string;
  description?: string;
  command?: string;
  cwd?: string;
  type?: string;
}

function parseActionFile(
  filePath: string,
  scope: ActionDefinition["scope"],
  opts: {
    repoLabel?: string;
    treePath?: string;
  },
): ActionDefinition | null {
  let raw: RawActionToml;
  try {
    raw = TOML.parse(readFileSync(filePath, "utf-8")) as RawActionToml;
  } catch {
    return null;
  }

  if (raw.type && raw.type !== "command") return null;
  if (!raw.command?.trim()) return null;

  const fileStem = basename(filePath, ".toml");
  const name = (raw.name?.trim() || fileStem).trim();
  const repoLabel = opts.repoLabel ?? null;
  const id = scope === "repo" && repoLabel ? `${repoLabel}/${name}` : name;

  return {
    id,
    name,
    description: raw.description?.trim() || name,
    command: raw.command.trim(),
    cwd: raw.cwd?.trim() || null,
    scope,
    repoLabel,
    treePath: opts.treePath ?? null,
    sourceFile: filePath,
  };
}

function loadTomlDir(
  dir: string,
  scope: ActionDefinition["scope"],
  opts: { repoLabel?: string; treePath?: string },
): ActionDefinition[] {
  if (!existsSync(dir)) return [];

  const files = readdirSync(dir).filter((f) => f.endsWith(".toml"));
  const actions: ActionDefinition[] = [];

  for (const file of files) {
    const action = parseActionFile(join(dir, file), scope, opts);
    if (action) actions.push(action);
  }

  return actions.sort((a, b) => a.id.localeCompare(b.id));
}

export function loadGlobalActions(): ActionDefinition[] {
  return loadTomlDir(paths.actionsDir, "global", {});
}

export function loadRepoActions(
  treePath: string,
  repoLabel: string,
): ActionDefinition[] {
  if (!isPathTrusted(treePath)) return [];
  return loadTomlDir(join(treePath, REPO_ACTIONS_DIR), "repo", {
    repoLabel,
    treePath,
  });
}

export function loadWorkspaceActions(ws: WorkspaceState): ActionDefinition[] {
  const actions = loadGlobalActions();
  const seen = new Set(actions.map((a) => a.id));

  for (const tree of ws.trees) {
    const enriched = enrichTree(tree);
    const label = basename(tree.path);
    const repoActions = loadRepoActions(tree.path, label);
    for (const action of repoActions) {
      if (seen.has(action.id)) continue;
      seen.add(action.id);
      actions.push({
        ...action,
        treePath: enriched.path,
      });
    }
  }

  return actions.sort((a, b) => a.id.localeCompare(b.id));
}

export function findAction(
  actions: ActionDefinition[],
  id: string,
): ActionDefinition | undefined {
  return actions.find((a) => a.id === id);
}
