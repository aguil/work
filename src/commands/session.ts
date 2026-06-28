import type { Command } from "commander";
import { findWorkspaceBySession } from "../workspace/state.js";

export function registerSessionCommands(program: Command): void {
  const session = program
    .command("session")
    .description("Session lifecycle helpers (called by tmux hooks)");

  session
    .command("is-tracked")
    .description("Exit 0 when the tmux session has a tracked workspace")
    .argument("<session>", "tmux session name")
    .option("-q, --quiet", "Suppress output")
    .action((sessionName: string, opts: { quiet?: boolean }) => {
      const ws = findWorkspaceBySession(sessionName);
      const tracked = Boolean(ws && !ws.archived);
      if (!opts.quiet) {
        console.log(tracked ? "true" : "false");
      }
      if (!tracked) process.exit(1);
    });
}
