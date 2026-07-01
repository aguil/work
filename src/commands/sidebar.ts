import type { Command } from "commander";
import { startSidebar } from "../sidebar/index.js";

export function registerSidebarCommand(program: Command): void {
  program
    .command("sidebar")
    .description("Start the sidebar TUI (runs in a tmux pane)")
    .action(async () => {
      await startSidebar();
    });
}
