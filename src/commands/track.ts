import type { Command } from "commander";
import * as tmux from "../tmux/client.js";
import {
  createWorkspace,
  findWorkspaceBySession,
  findArchivedWorkspaceBySession,
  unarchiveWorkspace,
  saveWorkspace,
  listWorkspaces,
  deleteWorkspace,
} from "../workspace/state.js";

export function registerTrackCommands(program: Command): void {
  program
    .command("track")
    .description("Start tracking a tmux session as a workspace")
    .argument("<session>", "tmux session name")
    .option("-q, --quiet", "Suppress output")
    .action(
      (
        session: string,
        opts: {
          quiet?: boolean;
        },
      ) => {
      if (!tmux.hasSession(session)) {
        if (!opts.quiet) console.error(`Session "${session}" not found`);
        process.exit(1);
      }

      const existing = findWorkspaceBySession(session);
      if (existing) {
        if (!opts.quiet)
          console.log(`Session "${session}" already tracked as workspace "${existing.name}"`);
        return;
      }

      const archived = findArchivedWorkspaceBySession(session);
      const ws = archived
        ? unarchiveWorkspace(archived)
        : createWorkspace(session, session, false);
      tmux.setOption("session", "@work-workspace", ws.name, session);
      tmux.setOption("session", "@work-sidebar-visible", "1", session);

      if (!opts.quiet) {
        if (archived) {
          console.log(
            `Restored workspace "${ws.name}" (${ws.trees.length} trees, ${Object.keys(ws.agents).length} agents)`,
          );
        } else {
          console.log(`Tracking session "${session}" as workspace "${ws.name}"`);
        }
      }
    },
    );

  program
    .command("untrack")
    .description("Stop tracking a tmux session")
    .argument("<session>", "tmux session name")
    .option("--auto", "Hook-triggered: archive silently instead of deleting")
    .option("-q, --quiet", "Suppress output")
    .action(
      (session: string, opts: { auto?: boolean; quiet?: boolean }) => {
        const ws = findWorkspaceBySession(session);
        if (!ws) {
          if (!opts.quiet) console.error(`Session "${session}" is not tracked`);
          return;
        }

        if (opts.auto) {
          ws.archived = true;
          saveWorkspace(ws);
          if (!opts.quiet) console.log(`Archived workspace "${ws.name}"`);
        } else {
          deleteWorkspace(ws.name);
          if (!opts.quiet) console.log(`Untracked workspace "${ws.name}"`);
        }
      },
    );

  program
    .command("list")
    .description("List tracked workspaces")
    .option("--json", "Output as JSON")
    .option("--all", "Include archived workspaces")
    .action((opts: { json?: boolean; all?: boolean }) => {
      let workspaces = listWorkspaces();
      if (!opts.all) {
        workspaces = workspaces.filter((w) => !w.archived);
      }

      if (opts.json) {
        console.log(JSON.stringify(workspaces, null, 2));
        return;
      }

      if (workspaces.length === 0) {
        console.log("No tracked workspaces");
        return;
      }

      for (const ws of workspaces) {
        const agents = Object.values(ws.agents);
        const active = agents.filter((a) => a.status !== "detached").length;
        const archived = ws.archived ? " (archived)" : "";
        console.log(
          `${ws.name} → ${ws.sessionName}  agents: ${active}/${agents.length}  trees: ${ws.trees.length}${archived}`,
        );
      }
    });
}
