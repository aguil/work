import type { Command } from "commander";
import {
  addTrustedRepo,
  listTrustedRepos,
  removeTrustedRepo,
} from "../config/trust.js";

export function registerTrustCommands(program: Command): void {
  const trust = program
    .command("trust")
    .description("Manage trusted repos for repo-local quick actions");

  trust
    .command("list")
    .description("List trusted repository paths")
    .option("--json", "Output as JSON")
    .action((opts: { json?: boolean }) => {
      const repos = listTrustedRepos();
      if (opts.json) {
        console.log(JSON.stringify({ repos }, null, 2));
        return;
      }

      if (repos.length === 0) {
        console.log("No trusted repos");
        return;
      }

      for (const repo of repos) {
        console.log(repo);
      }
    });

  trust
    .command("add")
    .description("Trust a repository for repo-local actions")
    .argument("<path>", "Repository or checkout path")
    .action((path: string) => {
      const abs = addTrustedRepo(path);
      console.log(`Trusted ${abs}`);
    });

  trust
    .command("remove")
    .description("Remove a repository from the trust store")
    .argument("<path>", "Repository path")
    .action((path: string) => {
      if (!removeTrustedRepo(path)) {
        throw new Error(`Not trusted: ${path}`);
      }
      console.log(`Removed trust for ${path}`);
    });
}
