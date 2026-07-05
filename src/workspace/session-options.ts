import * as tmux from "../tmux/client.js";
import type { WorkspaceState } from "./state.js";

/** Re-apply the tmux session option that marks a workspace as tracked. */
export function hydrateTrackedSessionOption(
  ws: WorkspaceState,
  sessionName: string,
): void {
  tmux.setOption("session", "@work-workspace", ws.name, sessionName);
}
