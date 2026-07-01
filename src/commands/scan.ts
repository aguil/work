import type { Command } from "commander";
import { scanPane, scanSession } from "../scanner/scan-session.js";
import * as tmux from "../tmux/client.js";
import { listWorkspaces } from "../workspace/state.js";

export function registerScanCommand(program: Command): void {
  program
    .command("scan")
    .description("Scan panes for agent CLIs")
    .option("-s, --session <name>", "Scan all panes in a session")
    .option("-p, --pane <id>", "Scan a single pane (fast path for hooks)")
    .option("-a, --all", "Scan all sessions (not just tracked)")
    .option("-q, --quiet", "Suppress output")
    .action(
      (opts: {
        session?: string;
        pane?: string;
        all?: boolean;
        quiet?: boolean;
      }) => {
        if (opts.pane && opts.session) {
          throw new Error("Use either --pane or --session, not both");
        }

        if (opts.pane) {
          const totalNew = scanPane(opts.pane, { quiet: opts.quiet });
          if (!opts.quiet && totalNew === 0) {
            console.log("No new agents detected");
          }
          return;
        }

        const trackedWorkspaces = listWorkspaces().filter((w) => !w.archived);
        const trackedSessions = new Set(
          trackedWorkspaces.map((w) => w.sessionName),
        );

        let totalNew = 0;

        if (opts.session) {
          totalNew = scanSession(opts.session, { quiet: opts.quiet });
        } else {
          const panes = tmux.listPanes();
          const sessionNames = new Set(panes.map((p) => p.sessionName));

          for (const sessionName of sessionNames) {
            if (!opts.all && !trackedSessions.has(sessionName)) continue;
            totalNew += scanSession(sessionName, { quiet: opts.quiet });
          }
        }

        if (!opts.quiet && totalNew === 0) {
          console.log("No new agents detected");
        }
      },
    );
}
