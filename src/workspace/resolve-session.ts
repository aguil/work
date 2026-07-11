import * as tmux from "../tmux/client.js";
import {
  findArchivedWorkspaceBySession,
  findWorkspaceBySession,
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
): WorkspaceState | null {
  const active = findWorkspaceBySession(sessionName);
  if (active) return active;
  if (!tmux.hasSession(sessionName)) return null;
  const archived = findArchivedWorkspaceBySession(sessionName);
  if (!archived) return null;
  return unarchiveWorkspace(archived);
}
