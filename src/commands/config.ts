import type { Command } from "commander";
import {
  getConfig,
  parseConfigValue,
  setConfigValue,
} from "../config/store.js";

export function registerConfigCommands(program: Command): void {
  const config = program
    .command("config")
    .description("Manage work configuration");

  config
    .command("get")
    .description("Get a configuration value")
    .argument("<key>", "Configuration key")
    .action((key: string) => {
      const cfg = getConfig();
      if (!(key in cfg)) {
        console.error(`Unknown config key: ${key}`);
        process.exit(1);
      }
      const value = cfg[key as keyof typeof cfg];
      if (Array.isArray(value)) {
        console.log(value.join(","));
      } else {
        console.log(String(value));
      }
    });

  config
    .command("set")
    .description("Set a configuration value")
    .argument("<key>", "Configuration key")
    .argument("<value>", "Value to set")
    .action((key: string, raw: string) => {
      const parsed = parseConfigValue(key, raw);
      if (parsed === undefined) {
        console.error(`Unknown config key: ${key}`);
        process.exit(1);
      }
      setConfigValue(
        key as Parameters<typeof setConfigValue>[0],
        parsed as never,
      );
      console.log(`${key} = ${raw}`);
      if (key === "auto-track") {
        if (parsed === true) {
          console.log(
            "New tmux sessions will be tracked and scanned automatically.",
          );
        } else {
          console.log(
            "Auto-track disabled. Use 'work track <session>' for manual tracking.",
          );
        }
      }
      if (key === "repo-scan-dir") {
        const dirs = parsed as string[];
        if (dirs.length === 0) {
          console.log("Repo scan disabled.");
        } else {
          console.log(
            `Scanning ${dirs.length} director${dirs.length === 1 ? "y" : "ies"} for repos.`,
          );
        }
      }
      if (key === "prompt-repos-on-new-window") {
        if (parsed === true) {
          console.log(
            "New windows in tracked sessions will show the repo picker to add a tree and cd.",
          );
        } else {
          console.log("Repo picker on new window disabled.");
        }
      }
      if (key === "checkout-base") {
        if (parsed) {
          console.log(`Project checkouts will be created under ${parsed}.`);
        } else {
          console.log(
            "Checkout base cleared; inferred from workspace trees or ~/dev/projects/<session>.",
          );
        }
      }
    });

  config
    .command("list")
    .description("List all configuration values")
    .action(() => {
      const cfg = getConfig();
      for (const [key, value] of Object.entries(cfg)) {
        const display = Array.isArray(value) ? value.join(",") : String(value);
        console.log(`${key} = ${display}`);
      }
    });
}
