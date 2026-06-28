import type { Command } from "commander";
import * as tmux from "../tmux/client.js";
import { detectAgents } from "../scanner/detect.js";
import {
  listWorkspaces,
  saveWorkspace,
  findAgentByPane,
  upsertAgent,
  autoLabel,
} from "../workspace/state.js";

export function registerReconcileCommand(program: Command): void {
  program
    .command("reconcile")
    .description("Re-sync workspace state with live tmux state")
    .option("-a, --all", "Reconcile all tracked workspaces")
    .option("-q, --quiet", "Suppress output")
    .action((opts: { all?: boolean; quiet?: boolean }) => {
      const workspaces = listWorkspaces().filter((w) => !w.archived);
      const sessions = tmux.listSessions();
      const sessionNames = new Set(sessions.map((s) => s.name));
      const allPanes = tmux.listPanes();

      let totalFixed = 0;
      let totalDetached = 0;
      let totalNew = 0;

      for (const ws of workspaces) {
        if (!sessionNames.has(ws.sessionName)) {
          // Session gone -- mark all agents as detached
          let changed = false;
          for (const agent of Object.values(ws.agents)) {
            if (agent.status !== "detached") {
              agent.status = "detached";
              agent.detachedAt = new Date().toISOString();
              agent.paneId = null;
              totalDetached++;
              changed = true;
            }
          }
          if (changed) saveWorkspace(ws);
          if (!opts.quiet)
            console.log(
              `${ws.name}: session "${ws.sessionName}" not found, agents detached`,
            );
          continue;
        }

        const sessionPanes = allPanes.filter(
          (p) => p.sessionName === ws.sessionName,
        );
        const livePaneIds = new Set(sessionPanes.map((p) => p.id));

        // Re-map agents whose pane IDs are stale
        for (const agent of Object.values(ws.agents)) {
          if (agent.paneId && !livePaneIds.has(agent.paneId)) {
            // Try to find by tmux user option
            const match = sessionPanes.find((p) => {
              const label = tmux.getOption("pane", "@workctl-agent-label", p.id);
              return label === agent.label;
            });

            if (match) {
              agent.paneId = match.id;
              agent.status = "unknown";
              agent.detachedAt = null;
              totalFixed++;
              if (!opts.quiet)
                console.log(
                  `${ws.name}: re-mapped ${agent.label} → ${match.id}`,
                );
            } else {
              agent.status = "detached";
              agent.detachedAt = new Date().toISOString();
              agent.paneId = null;
              totalDetached++;
              if (!opts.quiet)
                console.log(`${ws.name}: detached ${agent.label}`);
            }
          }
        }

        // Discover new agents
        const detected = detectAgents(sessionPanes);
        for (const d of detected) {
          const existing = findAgentByPane(ws, d.paneId);
          if (existing) continue;

          // Check if any detached agent matches this CLI
          const detachedMatch = Object.values(ws.agents).find(
            (a) =>
              a.status === "detached" && a.cli === d.cli && !a.paneId,
          );

          if (detachedMatch) {
            detachedMatch.paneId = d.paneId;
            detachedMatch.status = "unknown";
            detachedMatch.detachedAt = null;
            detachedMatch.lastSeen = new Date().toISOString();
            totalFixed++;
            if (!opts.quiet)
              console.log(
                `${ws.name}: re-attached ${detachedMatch.label} → ${d.paneId}`,
              );
          } else {
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
            totalNew++;
            if (!opts.quiet)
              console.log(
                `${ws.name}: discovered ${d.cli} → ${label} (${d.paneId})`,
              );
          }
        }

        saveWorkspace(ws);
      }

      if (!opts.quiet) {
        console.log(
          `Reconcile complete: ${totalFixed} re-mapped, ${totalNew} new, ${totalDetached} detached`,
        );
      }
    });
}
