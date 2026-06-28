import type { Command } from "commander";
import { listWorkspaces } from "../workspace/state.js";

export function registerStatusCommand(program: Command): void {
  program
    .command("status")
    .description("Status summary for tmux status-line")
    .option("--format <type>", 'Output format: "tmux" or "plain"', "plain")
    .action((opts: { format: string }) => {
      const workspaces = listWorkspaces().filter((w) => !w.archived);

      let total = 0;
      let working = 0;
      let blocked = 0;
      let idle = 0;
      let detached = 0;

      for (const ws of workspaces) {
        for (const agent of Object.values(ws.agents)) {
          total++;
          switch (agent.status) {
            case "working":
              working++;
              break;
            case "blocked":
              blocked++;
              break;
            case "idle":
            case "done":
              idle++;
              break;
            case "detached":
              detached++;
              break;
          }
        }
      }

      if (opts.format === "tmux") {
        const parts: string[] = [];
        if (working > 0) parts.push(`#[fg=yellow]⟳${working}#[default]`);
        if (blocked > 0) parts.push(`#[fg=red]⏸${blocked}#[default]`);
        if (idle > 0) parts.push(`#[fg=green]–${idle}#[default]`);
        if (detached > 0) parts.push(`#[fg=colour240]⊘${detached}#[default]`);
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
      if (detached > 0) parts.push(`${detached} detached`);
      console.log(parts.join(", "));
    });
}
