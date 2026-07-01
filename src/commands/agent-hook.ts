import { readFileSync } from "node:fs";
import type { Command } from "commander";
import { applyHookEvent } from "../adapters/apply-hook-event.js";
import {
  type AgentHookInput,
  parseHookInput,
} from "../adapters/hook-events.js";
import type { AgentStatus } from "../workspace/state.js";

function readHookInput(opts: { file?: string }): AgentHookInput {
  if (opts.file) {
    return parseHookInput(readFileSync(opts.file, "utf-8"));
  }
  const piped = readFileSync(0, "utf-8");
  return parseHookInput(piped);
}

export function registerAgentHookCommand(agent: Command): void {
  agent
    .command("hook-event")
    .description(
      "Apply Tier 1 status from a Cursor or Claude Code hook JSON payload (stdin or --file)",
    )
    .option("-f, --file <path>", "Read hook JSON from a file")
    .option("--pane <id>", "Tmux pane ID (%N) when TMUX is unavailable to hook")
    .option(
      "--status <status>",
      "Override mapped status (idle|working|blocked|done|error)",
    )
    .option("--json", "Output result as JSON")
    .option("-q, --quiet", "Suppress output")
    .action(
      (opts: {
        file?: string;
        pane?: string;
        status?: string;
        json?: boolean;
        quiet?: boolean;
      }) => {
        let input: AgentHookInput;
        try {
          input = readHookInput(opts);
        } catch (err) {
          if (!opts.quiet) {
            console.error(
              `Invalid hook JSON: ${err instanceof Error ? err.message : err}`,
            );
          }
          process.exit(1);
        }

        const statusOverride = opts.status as AgentStatus | undefined;
        const result = applyHookEvent(input, {
          paneId: opts.pane,
          statusOverride,
        });

        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        if (opts.quiet) return;

        if (!result.applied) {
          console.log(
            `Hook ${result.event}: no tracked agent (status=${result.status ?? "n/a"})`,
          );
          return;
        }

        console.log(
          `${result.workspace}/${result.label}: ${result.status} (explicit, ${result.event})`,
        );
      },
    );
}
