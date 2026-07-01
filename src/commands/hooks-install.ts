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
import type { Command } from "commander";

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

function resolveWorkBin(): string {
  if (process.env.WORK_BIN) return process.env.WORK_BIN;
  return process.argv[1] ?? "work";
}

function mergeHooksJson(existing: HooksJson, command: string): HooksJson {
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
    .description("Install Cursor hooks that report agent status to work")
    .argument("[target]", "Hook bundle to install", "cursor")
    .option("--dry-run", "Show paths without writing files")
    .action((target: string, opts: { dryRun?: boolean }) => {
      if (target !== "cursor") {
        console.error(`Unknown hook bundle: ${target}`);
        process.exit(1);
      }

      const srcScript = join(bundledHooksDir(), "work-event.sh");
      if (!existsSync(srcScript)) {
        console.error(`Bundled hook script missing: ${srcScript}`);
        console.error("Run npm run build first.");
        process.exit(1);
      }

      const cursorDir = join(homedir(), ".cursor");
      const hooksDir = join(cursorDir, "hooks");
      const destScript = join(hooksDir, "work-event.sh");
      const hooksJsonPath = join(cursorDir, "hooks.json");
      const workBin = resolveWorkBin();
      const command = "./hooks/work-event.sh";

      if (opts.dryRun) {
        console.log(`Would install ${destScript}`);
        console.log(`Would update ${hooksJsonPath}`);
        console.log(`WORK_BIN=${workBin}`);
        return;
      }

      mkdirSync(hooksDir, { recursive: true });

      let script = readFileSync(srcScript, "utf-8");
      script = script.replace("__WORK_BIN__", workBin.replace(/'/g, "'\\''"));
      writeFileSync(destScript, script, { mode: 0o755 });
      chmodSync(destScript, 0o755);

      let existing: HooksJson = { version: 1, hooks: {} };
      if (existsSync(hooksJsonPath)) {
        try {
          existing = JSON.parse(
            readFileSync(hooksJsonPath, "utf-8"),
          ) as HooksJson;
        } catch {
          console.error(
            `Could not parse ${hooksJsonPath}; refusing to overwrite.`,
          );
          process.exit(1);
        }
      }

      const merged = mergeHooksJson(existing, command);
      writeFileSync(hooksJsonPath, `${JSON.stringify(merged, null, 2)}\n`);

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
      const workBin = resolveWorkBin();
      console.log(`export WORK_BIN='${workBin.replace(/'/g, "'\\''")}'`);
    });
}
