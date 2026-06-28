import type { Command } from "commander";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CURSOR_HOOK_EVENTS = [
  "sessionStart",
  "sessionEnd",
  "preToolUse",
  "postToolUse",
  "postToolUseFailure",
  "beforeShellExecution",
  "beforeMCPExecution",
  "stop",
  "afterAgentResponse",
  "afterAgentThought",
  "subagentStart",
  "subagentStop",
] as const;

interface HooksJson {
  version: number;
  hooks: Record<string, Array<{ command: string }>>;
}

function bundledHooksDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "hooks", "cursor");
}

function resolveWorkctlBin(): string {
  if (process.env.WORKCTL_BIN) return process.env.WORKCTL_BIN;
  return process.argv[1] ?? "workctl";
}

function mergeHooksJson(
  existing: HooksJson,
  command: string,
): HooksJson {
  const hooks = { ...existing.hooks };
  const entry = { command };

  for (const event of CURSOR_HOOK_EVENTS) {
    const current = hooks[event] ?? [];
    const already = current.some((h) => h.command === command);
    hooks[event] = already ? current : [...current, entry];
  }

  return {
    version: existing.version ?? 1,
    hooks,
  };
}

export function registerHooksCommands(program: Command): void {
  const hooks = program.command("hooks").description("Cursor hook integration");

  hooks
    .command("install")
    .description("Install Cursor hooks that report agent status to workctl")
    .argument("[target]", "Hook bundle to install", "cursor")
    .option("--dry-run", "Show paths without writing files")
    .action((target: string, opts: { dryRun?: boolean }) => {
      if (target !== "cursor") {
        console.error(`Unknown hook bundle: ${target}`);
        process.exit(1);
      }

      const srcScript = join(bundledHooksDir(), "workctl-event.sh");
      if (!existsSync(srcScript)) {
        console.error(`Bundled hook script missing: ${srcScript}`);
        console.error("Run npm run build first.");
        process.exit(1);
      }

      const cursorDir = join(homedir(), ".cursor");
      const hooksDir = join(cursorDir, "hooks");
      const destScript = join(hooksDir, "workctl-event.sh");
      const hooksJsonPath = join(cursorDir, "hooks.json");
      const workctlBin = resolveWorkctlBin();
      const command = "./hooks/workctl-event.sh";

      if (opts.dryRun) {
        console.log(`Would install ${destScript}`);
        console.log(`Would update ${hooksJsonPath}`);
        console.log(`WORKCTL_BIN=${workctlBin}`);
        return;
      }

      mkdirSync(hooksDir, { recursive: true });

      let script = readFileSync(srcScript, "utf-8");
      script = script.replace(
        "__WORKCTL_BIN__",
        workctlBin.replace(/'/g, "'\\''"),
      );
      writeFileSync(destScript, script, { mode: 0o755 });
      chmodSync(destScript, 0o755);

      let existing: HooksJson = { version: 1, hooks: {} };
      if (existsSync(hooksJsonPath)) {
        try {
          existing = JSON.parse(readFileSync(hooksJsonPath, "utf-8")) as HooksJson;
        } catch {
          console.error(`Could not parse ${hooksJsonPath}; refusing to overwrite.`);
          process.exit(1);
        }
      }

      const merged = mergeHooksJson(existing, command);
      writeFileSync(hooksJsonPath, JSON.stringify(merged, null, 2) + "\n");

      console.log(`Installed ${destScript}`);
      console.log(`Updated ${hooksJsonPath}`);
      console.log(
        "Reload Cursor or save hooks.json again if hooks do not fire immediately.",
      );
    });

  hooks
    .command("print-env")
    .description("Print env vars to set before launching Cursor/agent in tmux")
    .action(() => {
      const workctlBin = resolveWorkctlBin();
      console.log(`export WORKCTL_BIN='${workctlBin.replace(/'/g, "'\\''")}'`);
    });
}
