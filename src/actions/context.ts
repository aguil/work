import { shellQuote } from "../shell-quote.js";
import * as tmux from "../tmux/client.js";
import { enrichTree, treeContextVars } from "../vcs/detect.js";
import type { WorkspaceState } from "../workspace/state.js";
import type { ActionDefinition } from "./types.js";

export interface ActionContext {
  WORKSPACE: string;
  SESSION: string;
  WINDOW: string;
  PANE: string;
  PWD: string;
  TREE_ROOT: string;
  TREE_BRANCH: string;
  TREE_VCS: string;
}

export function buildActionContext(
  ws: WorkspaceState,
  action: ActionDefinition,
  sessionName: string,
): ActionContext {
  const pane =
    tmux.listPanes(sessionName).find((p) => p.active) ??
    tmux.listPanes(sessionName)[0];

  let treeRoot = "";
  let treeBranch = "";
  let treeVcs = "";

  if (action.treePath) {
    const tree = ws.trees.find((t) => t.path === action.treePath);
    if (tree) {
      const vars = treeContextVars(enrichTree(tree));
      treeRoot = vars.TREE_ROOT;
      treeBranch = vars.TREE_BRANCH;
      treeVcs = vars.TREE_VCS;
    }
  } else if (ws.trees.length > 0) {
    const vars = treeContextVars(enrichTree(ws.trees[0]));
    treeRoot = vars.TREE_ROOT;
    treeBranch = vars.TREE_BRANCH;
    treeVcs = vars.TREE_VCS;
  }

  return {
    WORKSPACE: ws.name,
    SESSION: sessionName,
    WINDOW: pane ? String(pane.windowIndex) : "",
    PANE: pane?.id ?? "",
    PWD: pane?.currentPath ?? "",
    TREE_ROOT: treeRoot,
    TREE_BRANCH: treeBranch,
    TREE_VCS: treeVcs,
  };
}

export function substituteActionTemplate(
  template: string,
  ctx: ActionContext,
): string {
  return template.replace(
    /\$([A-Z_][A-Z0-9_]*)|\$\{([A-Z_][A-Z0-9_]*)\}/g,
    (_match, a, b) => {
      const key = (a ?? b) as keyof ActionContext;
      const value = ctx[key] ?? "";
      return shellQuote(value);
    },
  );
}
