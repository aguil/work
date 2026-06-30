import type { Command } from "commander";
import { basename } from "node:path";
import * as tmux from "../tmux/client.js";
import { resolveTreePath } from "../vcs/detect.js";
import { resolveWindowCheckout } from "../workspace/checkout.js";
import { requireWorkspace } from "../workspace/helpers.js";
import { ensureTreeInWorkspace } from "../workspace/trees.js";

export function registerWindowCommands(program: Command): void {
  const window = program
    .command("window")
    .description("Window helpers (called by tmux hooks)");

  window
    .command("use-repo")
    .description(
      "Create or reuse a project checkout, associate it as a tree, and cd the window",
    )
    .argument("<repo-path>", "Repository path from repo-scan-dir")
    .option("-s, --session <name>", "Tracked tmux session")
    .option("-w, --window <target>", "Window target (e.g. #{window_id})")
    .option("-q, --quiet", "Suppress output")
    .action(
      (
        repoPath: string,
        opts: { session?: string; window?: string; quiet?: boolean },
      ) => {
        const ws = requireWorkspace(opts.session);
        const windowTarget = opts.window ?? tmux.displayMessage("#{window_id}");
        const repoAbs = resolveTreePath(repoPath);
        const { path: checkoutPath, createdByWork } = resolveWindowCheckout(
          ws,
          repoAbs,
        );

        ensureTreeInWorkspace(ws, checkoutPath, createdByWork);

        const paneId = tmux.activePaneInWindow(windowTarget);
        tmux.respawnPane(paneId, { cwd: checkoutPath });

        const windowName = basename(checkoutPath);
        try {
          tmux.renameWindow(windowTarget, windowName);
        } catch {
          // non-fatal
        }

        if (!opts.quiet) {
          const created = createdByWork ? " (new checkout)" : "";
          console.log(`${ws.name}: ${windowName} → ${checkoutPath}${created}`);
        }
      },
    );
}
