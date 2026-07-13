import { Command } from "commander";
import { WORK_VERSION } from "./version.js";

const program = new Command();

program
  .name("work")
  .description("Agent workspace manager for tmux")
  .version(WORK_VERSION);

// Phase 1 commands are registered in their respective modules
// and attached here. Importing them triggers registration.

function isHookEventInvocation(argv: string[]): boolean {
  const args = argv.slice(2);
  return args[0] === "agent" && args[1] === "hook-event";
}

async function main(): Promise<void> {
  if (isHookEventInvocation(process.argv)) {
    const { registerHookEventCli } = await import(
      "./commands/hook-event-cli.js"
    );
    registerHookEventCli(program);
    await program.parseAsync(process.argv);
    return;
  }

  const { registerTrackCommands } = await import("./commands/track.js");
  const { registerScanCommand } = await import("./commands/scan.js");
  const { registerAgentsCommands } = await import("./commands/agents.js");
  const { registerStatusCommand } = await import("./commands/status.js");
  const { registerReconcileCommand } = await import("./commands/reconcile.js");
  const { registerConfigCommands } = await import("./commands/config.js");
  const { registerSidebarCommand } = await import("./commands/sidebar.js");
  const { registerTreeCommands } = await import("./commands/trees.js");
  const { registerNewCommand } = await import("./commands/new.js");
  const { registerCloseCommand } = await import("./commands/close.js");
  const { registerLaunchCommand } = await import("./commands/launch.js");
  const { registerActionCommands } = await import("./commands/actions.js");
  const { registerTrustCommands } = await import("./commands/trust.js");
  const { registerReposCommands } = await import("./commands/repos.js");
  const { registerSessionCommands } = await import("./commands/session.js");
  const { registerWindowCommands } = await import("./commands/window.js");
  const { registerHooksCommands } = await import("./commands/hooks-install.js");

  registerTrackCommands(program);
  registerScanCommand(program);
  registerAgentsCommands(program);
  registerStatusCommand(program);
  registerReconcileCommand(program);
  registerConfigCommands(program);
  registerSidebarCommand(program);
  registerTreeCommands(program);
  registerNewCommand(program);
  registerCloseCommand(program);
  registerLaunchCommand(program);
  registerActionCommands(program);
  registerTrustCommands(program);
  registerReposCommands(program);
  registerSessionCommands(program);
  registerWindowCommands(program);
  registerHooksCommands(program);

  await program.parseAsync(process.argv);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
