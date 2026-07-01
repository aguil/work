import { basename, join } from "node:path";
import type { Command } from "commander";
import { promptConfirm } from "../prompt/readline.js";
import * as tmux from "../tmux/client.js";
import {
  canRemoveCheckout,
  createCheckout,
  detectRepoBackend,
  enrichTree,
  removeCheckout,
  resolveDestPath,
  resolveTreePath,
} from "../vcs/detect.js";
import { assessCheckoutRemovalRisk } from "../vcs/removal-risk.js";
import { requireWorkspace } from "../workspace/helpers.js";
import { listWorkspaces, saveWorkspace } from "../workspace/state.js";
import { addTreeToWorkspace, findTreeIndex } from "../workspace/trees.js";

export function registerTreeCommands(program: Command): void {
  program
    .command("add-tree")
    .description("Associate a checkout or directory with a tracked workspace")
    .argument("[path]", "Existing checkout, or source repo with --new-worktree")
    .option("-s, --session <name>", "Tracked tmux session")
    .option(
      "--new-worktree <branch>",
      "Create a git worktree or jj workspace before associating",
    )
    .option("--repo <path>", "Source repository (alternative to path arg)")
    .option(
      "--dest <path>",
      "Destination for --new-worktree (default: ./<repo-name> in cwd)",
    )
    .option("--open", "Open a new tmux window with cwd set to the tree")
    .option("-q, --quiet", "Suppress output")
    .action(
      (
        pathArg: string | undefined,
        opts: {
          session?: string;
          newWorktree?: string;
          repo?: string;
          dest?: string;
          open?: boolean;
          quiet?: boolean;
        },
      ) => {
        const ws = requireWorkspace(opts.session);
        let targetPath = pathArg;
        let createdByWork = false;

        if (opts.newWorktree) {
          const repoPath = resolveTreePath(opts.repo ?? pathArg ?? "");
          if (!opts.repo && !pathArg) {
            throw new Error(
              "Repository path is required with --new-worktree (positional or --repo)",
            );
          }

          const destPath = resolveDestPath(
            opts.dest ?? join(process.cwd(), basename(repoPath)),
          );

          const backend = detectRepoBackend(repoPath);
          createCheckout(backend, repoPath, destPath, opts.newWorktree);
          targetPath = destPath;
          createdByWork = true;
        } else if (!targetPath) {
          throw new Error("path argument is required");
        }

        const record = addTreeToWorkspace(ws, targetPath, createdByWork);

        if (opts.open) {
          if (!tmux.hasSession(ws.sessionName)) {
            throw new Error(`Tracked session not found: ${ws.sessionName}`);
          }
          const windowName = basename(record.path);
          tmux.newWindow({
            target: ws.sessionName,
            name: windowName,
            cwd: record.path,
          });
        }

        if (!opts.quiet) {
          const meta = enrichTree(record);
          const branch = meta.branch ? ` (${meta.branch})` : "";
          const opened = opts.open ? " (window opened)" : "";
          console.log(
            `${ws.name}: added tree ${meta.path} [${meta.vcsType}]${branch}${opened}`,
          );
        }
      },
    );

  program
    .command("remove-tree")
    .description(
      "Remove a tree association and forget work-created jj/git checkouts",
    )
    .argument("<path>", "Associated directory path")
    .option("-s, --session <name>", "Tracked tmux session")
    .option(
      "--no-cleanup",
      "Only remove the association; leave checkouts on disk",
    )
    .option(
      "--force",
      "Remove checkout even when there are unmerged or uncommitted changes",
    )
    .option("-q, --quiet", "Suppress output")
    .action(
      async (
        path: string,
        opts: {
          session?: string;
          noCleanup?: boolean;
          force?: boolean;
          quiet?: boolean;
        },
      ) => {
        const ws = requireWorkspace(opts.session);
        const idx = findTreeIndex(ws, path);
        if (idx < 0) {
          throw new Error(`Tree not associated: ${path}`);
        }

        const removed = ws.trees[idx];
        const willCleanup =
          !opts.noCleanup &&
          canRemoveCheckout(
            removed.path,
            removed.vcsType,
            removed.createdByWork,
          );

        if (willCleanup && !opts.force) {
          const risk = assessCheckoutRemovalRisk(removed.path, removed.vcsType);
          if (risk.warnings.length > 0) {
            for (const warning of risk.warnings) {
              console.error(`warning: ${removed.path}: ${warning}`);
            }

            if (process.stdin.isTTY) {
              const proceed = await promptConfirm(
                "Remove checkout anyway?",
                false,
              );
              if (!proceed) {
                throw new Error("Aborted.");
              }
            } else {
              throw new Error(
                "Refusing to remove checkout with unmerged or uncommitted changes. Use --force.",
              );
            }
          }
        }

        ws.trees.splice(idx, 1);
        saveWorkspace(ws);

        let forgotCheckout = false;
        if (willCleanup) {
          removeCheckout(removed.path, removed.vcsType);
          forgotCheckout = true;
        }

        if (!opts.quiet) {
          const suffix = forgotCheckout ? " (checkout removed)" : "";
          console.log(`${ws.name}: removed tree ${removed.path}${suffix}`);
        }
      },
    );

  program
    .command("trees")
    .description("List trees associated with tracked workspaces")
    .option("-s, --session <name>", "Limit to one tracked session")
    .option("--json", "Output as JSON")
    .action((opts: { session?: string; json?: boolean }) => {
      if (opts.session) {
        const ws = requireWorkspace(opts.session);
        const trees = ws.trees.map(enrichTree);
        if (opts.json) {
          console.log(JSON.stringify({ workspace: ws.name, trees }, null, 2));
          return;
        }

        if (trees.length === 0) {
          console.log(`No trees for workspace "${ws.name}"`);
          return;
        }

        for (const tree of trees) {
          printTreeLine(ws.name, tree);
        }
        return;
      }

      const workspaces = listWorkspaces().filter((w) => !w.archived);
      const payload = workspaces.map((ws) => ({
        workspace: ws.name,
        sessionName: ws.sessionName,
        trees: ws.trees.map(enrichTree),
      }));

      if (opts.json) {
        console.log(JSON.stringify(payload, null, 2));
        return;
      }

      const allTrees = payload.flatMap((entry) =>
        entry.trees.map((tree) => ({ workspace: entry.workspace, tree })),
      );

      if (allTrees.length === 0) {
        console.log("No associated trees");
        return;
      }

      for (const { workspace, tree } of allTrees) {
        printTreeLine(workspace, tree);
      }
    });
}

function printTreeLine(
  workspace: string,
  tree: ReturnType<typeof enrichTree>,
): void {
  const branch = tree.branch ? ` ${tree.branch}` : "";
  const dirty = tree.dirty ? " *" : "";
  const sync =
    tree.ahead != null && tree.behind != null
      ? ` ↑${tree.ahead}↓${tree.behind}`
      : "";
  console.log(
    `${workspace}\t${tree.path}\t[${tree.vcsType}]${branch}${dirty}${sync}`,
  );
}
