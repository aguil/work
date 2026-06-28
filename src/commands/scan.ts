import type { Command } from "commander";
import * as tmux from "../tmux/client.js";
import { detectAgents } from "../scanner/detect.js";
import {
  findWorkspaceBySession,
  listWorkspaces,
  saveWorkspace,
  upsertAgent,
  findAgentByPane,
  autoLabel,
} from "../workspace/state.js";

export function registerScanCommand(program: Command): void {
  program
    .command("scan")
    .description("Scan panes for agent CLIs")
    .option("-s, --session <name>", "Scan a specific session")
    .option("-a, --all", "Scan all sessions (not just tracked)")
    .option("-q, --quiet", "Suppress output")
    .action(
      (opts: { session?: string; all?: boolean; quiet?: boolean }) => {
        const panes = opts.session
          ? tmux.listPanes(opts.session)
          : tmux.listPanes();

        const trackedWorkspaces = listWorkspaces().filter(
          (w) => !w.archived,
        );
        const trackedSessions = new Set(
          trackedWorkspaces.map((w) => w.sessionName),
        );

        const sessionPanes = new Map<string, typeof panes>();
        for (const pane of panes) {
          const arr = sessionPanes.get(pane.sessionName) ?? [];
          arr.push(pane);
          sessionPanes.set(pane.sessionName, arr);
        }

        let totalNew = 0;

        for (const [sessionName, sessPanes] of sessionPanes) {
          if (!opts.all && !trackedSessions.has(sessionName)) continue;

          const detected = detectAgents(sessPanes);
          if (detected.length === 0) continue;

          const ws = findWorkspaceBySession(sessionName);
          if (!ws) {
            if (!opts.quiet) {
              for (const d of detected) {
                console.log(
                  `[untracked] ${sessionName}: ${d.cli} in ${d.paneId}`,
                );
              }
            }
            continue;
          }

          for (const d of detected) {
            const existing = findAgentByPane(ws, d.paneId);
            if (existing) continue;

            const label = autoLabel(d.cli, ws);
            upsertAgent(ws, {
              label,
              cli: d.cli,
              paneId: d.paneId,
              status: "unknown",
              confidence: "none",
              detachedAt: null,
              lastSeen: new Date().toISOString(),
            });

            tmux.setOption("pane", "@workctl-agent-label", label, d.paneId);
            tmux.setOption("pane", "@workctl-agent-cli", d.cli, d.paneId);

            if (!opts.quiet)
              console.log(
                `${ws.name}: found ${d.cli} → ${label} (${d.paneId})`,
              );
            totalNew++;
          }

          if (totalNew > 0) saveWorkspace(ws);
        }

        if (!opts.quiet && totalNew === 0)
          console.log("No new agents detected");
      },
    );
}
