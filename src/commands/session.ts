import type { Command } from "commander";
import * as tmux from "../tmux/client.js";
import { hydrateTrackedSessionOption } from "../workspace/session-options.js";
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

  session
    .command("hydrate")
    .description(
      "Re-apply @work-workspace for a session with persisted workspace state",
    )
    .argument("<session>", "tmux session name")
    .option("-q, --quiet", "Suppress output")
    .action((sessionName: string, opts: { quiet?: boolean }) => {
      const ws = findWorkspaceBySession(sessionName);
      if (!ws || ws.archived) {
        if (!opts.quiet) {
          console.error(`Session "${sessionName}" has no active workspace`);
        }
        process.exit(1);
      }
      if (!tmux.hasSession(sessionName)) {
        if (!opts.quiet) {
          console.error(`Session "${sessionName}" not found`);
        }
        process.exit(1);
      }

      hydrateTrackedSessionOption(ws, sessionName);
      if (!opts.quiet) {
        console.log(`Hydrated tracking options for "${sessionName}"`);
      }
    });
}
