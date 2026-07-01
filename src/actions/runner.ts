import * as tmux from "../tmux/client.js";
import type { WorkspaceState } from "../workspace/state.js";
import { buildActionContext, substituteActionTemplate } from "./context.js";
import type { ActionDefinition } from "./types.js";

export function runAction(
  ws: WorkspaceState,
  action: ActionDefinition,
  sessionName: string,
): string {
  const ctx = buildActionContext(ws, action, sessionName);
  const command = substituteActionTemplate(action.command, ctx);
  const cwdTemplate = action.cwd
    ? substituteActionTemplate(action.cwd, ctx)
    : ctx.TREE_ROOT || ctx.PWD || undefined;

  const paneId = tmux.splitWindow({
    target: sessionName,
    cwd: cwdTemplate || undefined,
    command,
  });

  return paneId;
}
