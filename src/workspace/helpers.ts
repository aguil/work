import type { WorkspaceState } from "./state.js";
import { findWorkspaceBySession } from "./state.js";
import * as tmux from "../tmux/client.js";

export function currentSession(): string | null {
  if (!process.env.TMUX) return null;
  try {
    return tmux.displayMessage("#{session_name}");
  } catch {
    return null;
  }
}

export function requireWorkspace(session?: string): WorkspaceState {
  const sessionName = session ?? currentSession();
  if (!sessionName) {
    throw new Error(
      "No tmux session context. Pass --session or run inside tmux.",
    );
  }

  const ws = findWorkspaceBySession(sessionName);
  if (!ws) {
    throw new Error(`Session "${sessionName}" is not tracked`);
  }
  return ws;
}
