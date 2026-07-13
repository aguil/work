import type { Command } from "commander";
import { registerAgentHookCommand } from "./agent-hook.js";

/** Minimal `work agent hook-event` registration for fast hook subprocess startup. */
export function registerHookEventCli(program: Command): void {
  const agent = program
    .command("agent")
    .description("Apply Tier 1 agent hook events");
  registerAgentHookCommand(agent);
}
