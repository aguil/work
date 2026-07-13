import * as tmux from "../tmux/client.js";
import {
  loadWorkspacesForSession,
  unarchiveWorkspace,
  type WorkspaceState,
} from "./state.js";

export interface ResolveSessionOptions {
  /** Caller already listed this session as live (skip tmux has-session). */
  sessionListed?: boolean;
  /** When false, flip archived in memory only (caller persists on save). */
  persistUnarchive?: boolean;
}

export interface LoadedSessionWorkspaces {
  active: WorkspaceState | null;
  archived: WorkspaceState | null;
}

export function resolveWorkspaceFromLoaded(
  sessionName: string,
  loaded: LoadedSessionWorkspaces,
  options?: ResolveSessionOptions,
): WorkspaceState | null {
  if (loaded.active) return loaded.active;
  if (!options?.sessionListed && !tmux.hasSession(sessionName)) return null;
  if (!loaded.archived) return null;
  if (options?.persistUnarchive === false) {
    loaded.archived.archived = false;
    return loaded.archived;
  }
  return unarchiveWorkspace(loaded.archived);
}

/**
 * Active workspace for a tmux session. When the session is still running but
 * the workspace was archived (`work untrack --auto`), reactivate it like
 * `work track` so daemon, hooks, and CLI share one source of truth.
 */
export function resolveWorkspaceForSession(
  sessionName: string,
  allWorkspaces?: WorkspaceState[],
  options?: ResolveSessionOptions,
  loadedSession?: LoadedSessionWorkspaces,
): WorkspaceState | null {
  if (allWorkspaces) {
    const active =
      allWorkspaces.find((w) => !w.archived && w.sessionName === sessionName) ??
      null;
    if (active) return active;
    if (!options?.sessionListed && !tmux.hasSession(sessionName)) return null;
    const archived =
      allWorkspaces.find((w) => w.archived && w.sessionName === sessionName) ??
      null;
    if (!archived) return null;
    if (options?.persistUnarchive === false) {
      archived.archived = false;
      return archived;
    }
    return unarchiveWorkspace(archived);
  }

  const loaded = loadedSession ?? loadWorkspacesForSession(sessionName);
  return resolveWorkspaceFromLoaded(sessionName, loaded, options);
}
