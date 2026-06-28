import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Command } from "commander";
import { getConfigValue } from "../config/store.js";
import { promptLine, promptRepoSelection } from "../prompt/readline.js";
import * as tmux from "../tmux/client.js";
import {
  createCheckout,
  detectRepoBackend,
  detectVcs,
} from "../vcs/detect.js";
import { resolveRepoPaths, scanRepoDirectory } from "../vcs/scan.js";
import {
  createWorkspace,
  loadWorkspace,
  saveWorkspace,
  type TreeRecord,
} from "../workspace/state.js";

interface CreatedTree {
  repoName: string;
  repoPath: string;
  checkoutPath: string;
  vcsType: "git" | "jj";
}

export function registerNewCommand(program: Command): void {
  program
    .command("new")
    .description(
      "Create a workspace: worktrees, tmux session, and tracking",
    )
    .argument("<name>", "Workspace and tmux session name")
    .option(
      "--repos <paths>",
      "Comma-separated repo paths (non-interactive)",
    )
    .option("--branch <name>", "Branch or bookmark name for git worktrees")
    .option(
      "--dest-base <path>",
      "Base directory for created checkouts (default: ./<name>)",
    )
    .option("--no-attach", "Do not attach to the new tmux session")
    .option("-q, --quiet", "Suppress output")
    .action(
      async (
        name: string,
        opts: {
          repos?: string;
          branch?: string;
          destBase?: string;
          attach?: boolean;
          quiet?: boolean;
        },
      ) => {
        if (tmux.hasSession(name)) {
          throw new Error(`tmux session already exists: ${name}`);
        }

        const existing = loadWorkspace(name);
        if (existing && !existing.archived) {
          throw new Error(`Workspace already exists: ${name}`);
        }

        const scanDir = getConfigValue("repo-scan-dir");
        let selectedRepos;

        if (opts.repos) {
          selectedRepos = resolveRepoPaths(opts.repos, scanDir);
        } else {
          if (!scanDir) {
            throw new Error(
              "No repo-scan-dir configured. Run: workctl config set repo-scan-dir <path>",
            );
          }
          const repos = scanRepoDirectory(scanDir);
          if (repos.length === 0) {
            throw new Error(`No repositories found in ${scanDir}`);
          }

          if (!opts.quiet) {
            console.log(`Scanning ${scanDir} for repositories...`);
          }
          selectedRepos = await promptRepoSelection(repos);
        }

        const branch =
          opts.branch ??
          (await promptLine("Branch name", name));

        const destBase = resolve(opts.destBase ?? join(process.cwd(), name));
        mkdirSync(destBase, { recursive: true });

        const createdTrees: CreatedTree[] = [];
        for (const repo of selectedRepos) {
          const checkoutPath = join(destBase, repo.name);
          const backend = detectRepoBackend(repo.path);
          createCheckout(backend, repo.path, checkoutPath, branch);
          createdTrees.push({
            repoName: repo.name,
            repoPath: repo.path,
            checkoutPath,
            vcsType: repo.vcsType,
          });

          if (!opts.quiet) {
            const kind = backend === "jj" ? "jj workspace" : "git worktree";
            console.log(`  ${repo.name}: ${checkoutPath} (${kind})`);
          }
        }

        const first = createdTrees[0];
        tmux.newSession({
          name,
          cwd: first.checkoutPath,
          windowName: first.repoName,
          attach: false,
        });

        for (let i = 1; i < createdTrees.length; i++) {
          const tree = createdTrees[i];
          tmux.newWindow({
            target: name,
            name: tree.repoName,
            cwd: tree.checkoutPath,
          });
        }

        const ws = createWorkspace(name, name, true);
        ws.trees = createdTrees.map(
          (tree): TreeRecord => {
            const meta = detectVcs(tree.checkoutPath);
            return {
              path: tree.checkoutPath,
              vcsType: meta.vcsType,
              branch: meta.branch ?? branch,
              createdByWorkctl: true,
            };
          },
        );
        saveWorkspace(ws);
        tmux.setOption("session", "@workctl-workspace", ws.name, name);

        if (!opts.quiet) {
          console.log(`\nCreated tmux session "${name}"`);
          console.log(`Tracking workspace "${name}"`);
          console.log(`Trees: ${createdTrees.map((t) => t.repoName).join(", ")}`);
        }

        if (opts.attach !== false && process.stdin.isTTY) {
          tmux.attachSession(name);
        }
      },
    );
}
