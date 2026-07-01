import type { Command } from "commander";
import {
  findAction,
  loadGlobalActions,
  loadWorkspaceActions,
} from "../actions/loader.js";
import { runAction } from "../actions/runner.js";
import { requireWorkspace } from "../workspace/helpers.js";

function printActions(
  actions: ReturnType<typeof loadWorkspaceActions>,
  format: string,
): void {
  if (format === "json") {
    console.log(JSON.stringify(actions, null, 2));
    return;
  }

  if (format === "names") {
    for (const action of actions) {
      console.log(action.id);
    }
    return;
  }

  if (format === "tsv") {
    for (const action of actions) {
      console.log(`${action.id}\t${action.scope}\t${action.description}`);
    }
    return;
  }

  for (const action of actions) {
    const scope = action.scope === "repo" ? ` [${action.repoLabel}]` : "";
    console.log(`${action.id}${scope}  ${action.description}`);
  }
}

export function registerActionCommands(program: Command): void {
  const action = program
    .command("action")
    .description("Quick actions for tracked workspaces");

  action
    .command("list")
    .description("List available actions")
    .option("-s, --session <name>", "Tracked tmux session")
    .option("--json", "Output as JSON")
    .option("--format <type>", "Output format: text, names, tsv, json", "text")
    .action((opts: { session?: string; json?: boolean; format?: string }) => {
      const format = opts.json ? "json" : (opts.format ?? "text");

      if (!opts.session) {
        const globalActions = loadGlobalActions();
        printActions(globalActions, format);
        return;
      }

      const ws = requireWorkspace(opts.session);
      printActions(loadWorkspaceActions(ws), format);
    });

  action
    .command("run")
    .description("Run a quick action by id")
    .argument("<id>", "Action id (e.g. hello or frontend/test)")
    .option("-s, --session <name>", "Tracked tmux session")
    .option("-q, --quiet", "Suppress output")
    .action((id: string, opts: { session?: string; quiet?: boolean }) => {
      const ws = requireWorkspace(opts.session);
      const actions = loadWorkspaceActions(ws);
      const match = findAction(actions, id);
      if (!match) {
        throw new Error(`Action not found: ${id}`);
      }

      const paneId = runAction(ws, match, ws.sessionName);
      if (!opts.quiet) {
        console.log(`${ws.name}: ran ${match.id} in ${paneId}`);
      }
    });
}
