import type { Command } from "commander";
import { TMUX_STATUS_ICONS } from "../sidebar/icons.js";
import * as tmux from "../tmux/client.js";
import {
  countStatusLineAgents,
  formatIconForTmux,
} from "../workspace/agent-display.js";
import { type AgentRecord, listWorkspaces } from "../workspace/state.js";

function agentsInWindow(
  agents: AgentRecord[],
  windowId: string,
): AgentRecord[] {
  const paneIds = new Set(tmux.listPanes(windowId).map((pane) => pane.id));
  return agents.filter(
    (agent) => agent.paneId != null && paneIds.has(agent.paneId),
  );
}

export function registerStatusCommand(program: Command): void {
  program
    .command("status")
    .description("Status summary for tmux status-line")
    .option(
      "--format <type>",
      'Output format: "plain", "tmux", or "icon"',
      "plain",
    )
    .option(
      "-s, --session <name>",
      "Limit to agents in the tracked workspace for this tmux session",
    )
    .option(
      "-w, --window <id>",
      "Limit to agents in panes of this tmux window (e.g. @1)",
    )
    .action((opts: { format: string; session?: string; window?: string }) => {
      let workspaces = listWorkspaces().filter((w) => !w.archived);
      if (opts.session) {
        workspaces = workspaces.filter((w) => w.sessionName === opts.session);
      }

      let agents = workspaces.flatMap((ws) => Object.values(ws.agents));
      if (opts.window) {
        agents = agentsInWindow(agents, opts.window);
      }

      const counts = countStatusLineAgents(agents);

      if (opts.format === "icon") {
        console.log(formatIconForTmux(counts));
        return;
      }

      const { working, blocked, idle, total } = counts;

      if (opts.format === "tmux") {
        const parts: string[] = [];
        if (working > 0) {
          parts.push(
            `#[fg=yellow]${TMUX_STATUS_ICONS.working} ${working}#[default]`,
          );
        }
        if (blocked > 0) {
          parts.push(
            `#[fg=red]${TMUX_STATUS_ICONS.blocked} ${blocked}#[default]`,
          );
        }
        if (idle > 0) {
          parts.push(`#[fg=green]${TMUX_STATUS_ICONS.idle} ${idle}#[default]`);
        }
        console.log(parts.length > 0 ? parts.join(" ") : "");
        return;
      }

      if (total === 0) {
        console.log("No agents");
        return;
      }

      const parts: string[] = [`${total} agent${total !== 1 ? "s" : ""}`];
      if (working > 0) parts.push(`${working} working`);
      if (blocked > 0) parts.push(`${blocked} blocked`);
      if (idle > 0) parts.push(`${idle} idle`);
      console.log(parts.join(", "));
    });
}
