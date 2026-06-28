import type { Command } from "commander";
import { getRepoScanDirs } from "../config/store.js";
import { scanRepoDirectories } from "../vcs/scan.js";

export function registerReposCommands(program: Command): void {
  program
    .command("repos")
    .description("List repositories from repo-scan-dir")
    .option("--json", "Output as JSON")
    .option(
      "--format <type>",
      "Output format: text, names, tsv, json",
      "text",
    )
    .action((opts: { json?: boolean; format?: string }) => {
      const scanDirs = getRepoScanDirs();
      if (scanDirs.length === 0) {
        throw new Error(
          "No repo-scan-dir configured. Run: workctl config set repo-scan-dir <path>[,<path>...]",
        );
      }

      const repos = scanRepoDirectories(scanDirs);
      const format = opts.json ? "json" : (opts.format ?? "text");

      if (format === "json") {
        console.log(JSON.stringify(repos, null, 2));
        return;
      }

      if (format === "names") {
        for (const repo of repos) {
          console.log(repo.path);
        }
        return;
      }

      if (format === "tsv") {
        for (const repo of repos) {
          console.log(`${repo.path}\t${repo.vcsType}\t${repo.name}`);
        }
        return;
      }

      for (const repo of repos) {
        console.log(`${repo.name}\t${repo.path}\t[${repo.vcsType}]`);
      }
    });
}
