import { basename, join, resolve } from "node:path";
import type { Command } from "commander";
import * as tmux from "../tmux/client.js";
import {
  findWorkspaceBySession,
  listWorkspaces,
  saveWorkspace,
  type TreeRecord,
  type WorkspaceState,
} from "../workspace/state.js";
import {
  createCheckout,
  detectRepoBackend,
  detectVcs,
  enrichTree,
  resolveDestPath,
  resolveTreePath,
} from "../vcs/detect.js";

function currentSession(): string | null {
  if (!process.env.TMUX) return null;
  try {
    return tmux.displayMessage("#{session_name}");
  } catch {
    return null;
  }
}

function requireWorkspace(session?: string): WorkspaceState {
  const sessionName = session ?? currentSession();
  if (!sessionName) {
    throw new Error(
      "No tmux session context. Pass --session or run inside tmux.",
    );
  }

  const ws = findWorkspaceBySession(sessionName);
  if (!ws) {
    throw new Error(`Session "${sessionName}" is not tracked`);
  }
  return ws;
}

function treePathsEqual(a: string, b: string): boolean {
  try {
    return resolveTreePath(a) === resolveTreePath(b);
  } catch {
    return resolve(a) === resolve(b);
  }
}

function findTreeIndex(ws: WorkspaceState, path: string): number {
  return ws.trees.findIndex((tree) => treePathsEqual(tree.path, path));
}

function addTree(
  ws: WorkspaceState,
  path: string,
  createdByWorkctl: boolean,
): TreeRecord {
  const absPath = resolveTreePath(path);
  if (findTreeIndex(ws, absPath) >= 0) {
    throw new Error(`Tree already associated: ${absPath}`);
  }

  const meta = detectVcs(absPath);
  const record: TreeRecord = {
    path: absPath,
    vcsType: meta.vcsType,
    branch: meta.branch,
    createdByWorkctl,
  };
  ws.trees.push(record);
  saveWorkspace(ws);
  return record;
}

export function registerTreeCommands(program: Command): void {
  program
    .command("add-tree")
    .description("Associate a checkout or directory with a tracked workspace")
    .argument(
      "[path]",
      "Existing checkout, or source repo with --new-worktree",
    )
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
    .option("-q, --quiet", "Suppress output")
    .action(
      (
        pathArg: string | undefined,
        opts: {
          session?: string;
          newWorktree?: string;
          repo?: string;
          dest?: string;
          quiet?: boolean;
        },
      ) => {
        const ws = requireWorkspace(opts.session);
        let targetPath = pathArg;
        let createdByWorkctl = false;

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
          createdByWorkctl = true;
        } else if (!targetPath) {
          throw new Error("path argument is required");
        }

        const record = addTree(ws, targetPath!, createdByWorkctl);
        if (!opts.quiet) {
          const meta = enrichTree(record);
          const branch = meta.branch ? ` (${meta.branch})` : "";
          console.log(
            `${ws.name}: added tree ${meta.path} [${meta.vcsType}]${branch}`,
          );
        }
      },
    );

  program
    .command("remove-tree")
    .description("Remove a tree association (does not delete the checkout)")
    .argument("<path>", "Associated directory path")
    .option("-s, --session <name>", "Tracked tmux session")
    .option("-q, --quiet", "Suppress output")
    .action(
      (
        path: string,
        opts: { session?: string; quiet?: boolean },
      ) => {
        const ws = requireWorkspace(opts.session);
        const idx = findTreeIndex(ws, path);
        if (idx < 0) {
          throw new Error(`Tree not associated: ${path}`);
        }

        const [removed] = ws.trees.splice(idx, 1);
        saveWorkspace(ws);

        if (!opts.quiet) {
          console.log(`${ws.name}: removed tree ${removed.path}`);
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
