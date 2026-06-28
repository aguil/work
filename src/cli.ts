import { Command } from "commander";

const program = new Command();

program
  .name("workctl")
  .description("Agent workspace manager for tmux")
  .version("0.1.0");

// Phase 1 commands are registered in their respective modules
// and attached here. Importing them triggers registration.

async function main(): Promise<void> {
  const { registerTrackCommands } = await import("./commands/track.js");
  const { registerScanCommand } = await import("./commands/scan.js");
  const { registerAgentsCommands } = await import("./commands/agents.js");
  const { registerStatusCommand } = await import("./commands/status.js");
  const { registerReconcileCommand } = await import("./commands/reconcile.js");
  const { registerConfigCommands } = await import("./commands/config.js");
  const { registerSidebarCommand } = await import("./commands/sidebar.js");
  const { registerTreeCommands } = await import("./commands/trees.js");

  registerTrackCommands(program);
  registerScanCommand(program);
  registerAgentsCommands(program);
  registerStatusCommand(program);
  registerReconcileCommand(program);
  registerConfigCommands(program);
  registerSidebarCommand(program);
  registerTreeCommands(program);

  await program.parseAsync(process.argv);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
