import type { Command } from "commander";
import * as tmux from "../tmux/client.js";
import { promptConfirm } from "../prompt/readline.js";
import { removeCheckout } from "../vcs/detect.js";
import {
  loadWorkspace,
  saveWorkspace,
  type TreeRecord,
  type WorkspaceState,
} from "../workspace/state.js";

async function cleanupTree(
  tree: TreeRecord,
  opts: { yes?: boolean; noCleanup?: boolean; quiet?: boolean },
): Promise<boolean> {
  if (!tree.createdByWorkctl) return false;

  if (opts.noCleanup) return false;

  const shouldRemove =
    opts.yes ||
    (await promptConfirm(`Remove checkout ${tree.path}?`, false));

  if (!shouldRemove) return false;

  removeCheckout(tree.path, tree.vcsType);
  if (!opts.quiet) console.log(`Removed checkout ${tree.path}`);
  return true;
}

function archiveWorkspace(ws: WorkspaceState): void {
  ws.archived = true;
  saveWorkspace(ws);
}

export function registerCloseCommand(program: Command): void {
  program
    .command("close")
    .description("Close a workspace and optionally clean up created checkouts")
    .argument("<name>", "Workspace name")
    .option("-y, --yes", "Remove all workctl-created checkouts without prompting")
    .option("--no-cleanup", "Skip checkout cleanup")
    .option("-q, --quiet", "Suppress output")
    .action(
      async (
        name: string,
        opts: { yes?: boolean; noCleanup?: boolean; quiet?: boolean },
      ) => {
        const ws = loadWorkspace(name);
        if (!ws) {
          throw new Error(`Workspace not found: ${name}`);
        }

        if (tmux.hasSession(ws.sessionName)) {
          tmux.killSession(ws.sessionName);
          if (!opts.quiet) {
            console.log(`Killed tmux session "${ws.sessionName}"`);
          }
        }

        let removed = 0;
        for (const tree of ws.trees) {
          if (await cleanupTree(tree, opts)) removed++;
        }

        for (const agent of Object.values(ws.agents)) {
          agent.status = "detached";
          agent.detachedAt = new Date().toISOString();
          agent.paneId = null;
        }

        archiveWorkspace(ws);

        if (!opts.quiet) {
          console.log(`Archived workspace "${name}"`);
          if (removed > 0) {
            console.log(`Removed ${removed} checkout(s)`);
          }
        }
      },
    );
}
