import * as tmux from "../tmux/client.js";
import type { TmuxPane } from "../tmux/client.js";

export interface ObservationContext {
  paneTitle: string;
  bottomLines: string;
}

export function captureBottomLines(paneId: string, lines: number): string {
  const count = Math.max(lines, 1);
  return tmux.capturePane(paneId, { start: -count });
}

export function buildObservationContext(pane: TmuxPane): ObservationContext {
  return {
    paneTitle: pane.title,
    bottomLines: captureBottomLines(pane.id, 12),
  };
}

export function regionText(
  ctx: ObservationContext,
  region: "pane_title" | "bottom_lines",
  lines: number,
): string {
  if (region === "pane_title") return ctx.paneTitle;
  const allLines = ctx.bottomLines.split("\n");
  return allLines.slice(-Math.max(lines, 1)).join("\n");
}
