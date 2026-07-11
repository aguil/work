import * as tmux from "../tmux/client.js";
import {
  listWorkspaces,
  unarchiveWorkspace,
  type WorkspaceState,
} from "./state.js";

/**
 * Active workspace for a tmux session. When the session is still running but
 * the workspace was archived (`work untrack --auto`), reactivate it like
 * `work track` so daemon, hooks, and CLI share one source of truth.
 */
export function resolveWorkspaceForSession(
  sessionName: string,
  allWorkspaces?: WorkspaceState[],
): WorkspaceState | null {
  const all = allWorkspaces ?? listWorkspaces();
  const active =
    all.find((w) => !w.archived && w.sessionName === sessionName) ?? null;
  if (active) return active;
  if (!tmux.hasSession(sessionName)) return null;
  const archived =
    all.find((w) => w.archived && w.sessionName === sessionName) ?? null;
  if (!archived) return null;
  return unarchiveWorkspace(archived);
}
