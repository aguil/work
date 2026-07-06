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

const CLAUDE_HOOK_EVENTS = [
  "SessionStart",
  "SessionEnd",
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "PermissionRequest",
  "PermissionDenied",
  "UserPromptSubmit",
  "Stop",
  "StopFailure",
  "SubagentStart",
  "SubagentStop",
] as const;

type HookTarget = "cursor" | "claude";

interface CursorHooksJson {
  version: number;
  hooks: Record<string, Array<{ command: string }>>;
}

interface ClaudeHookHandler {
  type: "command";
  command: string;
  async?: boolean;
}

interface ClaudeMatcherGroup {
  matcher?: string;
  hooks: ClaudeHookHandler[];
}

interface ClaudeSettings {
  hooks?: Record<string, ClaudeMatcherGroup[]>;
  [key: string]: unknown;
}

function bundledHooksDir(target: HookTarget): string {
  return join(dirname(fileURLToPath(import.meta.url)), "hooks", target);
}

function resolveWorkBin(): string {
  if (process.env.WORK_BIN) return process.env.WORK_BIN;
  return process.argv[1] ?? "work";
}

function mergeCursorHooksJson(
  existing: CursorHooksJson,
  command: string,
): CursorHooksJson {
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

function claudeHookExists(
  groups: ClaudeMatcherGroup[] | undefined,
  command: string,
): boolean {
  for (const group of groups ?? []) {
    for (const handler of group.hooks) {
      if (handler.type === "command" && handler.command === command) {
        return true;
      }
    }
  }
  return false;
}

function mergeClaudeSettings(
  existing: ClaudeSettings,
  command: string,
): ClaudeSettings {
  const hooks = { ...(existing.hooks ?? {}) };
  const handler: ClaudeHookHandler = {
    type: "command",
    command,
    async: true,
  };

  for (const event of CLAUDE_HOOK_EVENTS) {
    const groups = [...(hooks[event] ?? [])];
    if (claudeHookExists(groups, command)) {
      hooks[event] = groups;
      continue;
    }
    groups.push({ hooks: [handler] });
    hooks[event] = groups;
  }

  return { ...existing, hooks };
}

function installHookBundle(
  target: HookTarget,
  opts: { dryRun?: boolean },
): void {
  const srcScript = join(bundledHooksDir(target), "work-event.sh");
  if (!existsSync(srcScript)) {
    console.error(`Bundled hook script missing: ${srcScript}`);
    console.error("Run npm run build first.");
    process.exit(1);
  }

  const workBin = resolveWorkBin();
  let destScript: string;
  let configPath: string;
  let command: string;

  if (target === "cursor") {
    const cursorDir = join(homedir(), ".cursor");
    destScript = join(cursorDir, "hooks", "work-event.sh");
    configPath = join(cursorDir, "hooks.json");
    command = "./hooks/work-event.sh";
  } else {
    const claudeDir = join(homedir(), ".claude");
    destScript = join(claudeDir, "hooks", "work-event.sh");
    configPath = join(claudeDir, "settings.json");
    command = "./hooks/work-event.sh";
  }

  if (opts.dryRun) {
    console.log(`Would install ${destScript}`);
    console.log(`Would update ${configPath}`);
    console.log(`WORK_BIN=${workBin}`);
    return;
  }

  mkdirSync(dirname(destScript), { recursive: true });

  let script = readFileSync(srcScript, "utf-8");
  script = script.replace("__WORK_BIN__", workBin.replace(/'/g, "'\\''"));
  writeFileSync(destScript, script, { mode: 0o755 });
  chmodSync(destScript, 0o755);

  if (target === "cursor") {
    let existing: CursorHooksJson = { version: 1, hooks: {} };
    if (existsSync(configPath)) {
      try {
        existing = JSON.parse(
          readFileSync(configPath, "utf-8"),
        ) as CursorHooksJson;
      } catch {
        console.error(`Could not parse ${configPath}; refusing to overwrite.`);
        process.exit(1);
      }
    }

    const merged = mergeCursorHooksJson(existing, command);
    writeFileSync(configPath, `${JSON.stringify(merged, null, 2)}\n`);
    console.log(`Installed ${destScript}`);
    console.log(`Updated ${configPath}`);
    console.log(
      "Reload Cursor or save hooks.json again if hooks do not fire immediately.",
    );
    return;
  }

  let existing: ClaudeSettings = {};
  if (existsSync(configPath)) {
    try {
      existing = JSON.parse(
        readFileSync(configPath, "utf-8"),
      ) as ClaudeSettings;
    } catch {
      console.error(`Could not parse ${configPath}; refusing to overwrite.`);
      process.exit(1);
    }
  }

  const merged = mergeClaudeSettings(existing, command);
  writeFileSync(configPath, `${JSON.stringify(merged, null, 2)}\n`);
  console.log(`Installed ${destScript}`);
  console.log(`Updated ${configPath}`);
  console.log(
    "Restart Claude Code or start a new session if hooks do not fire immediately.",
  );
}

export function registerHooksCommands(program: Command): void {
  const hooks = program
    .command("hooks")
    .description("Cursor and Claude Code hook integration");

  hooks
    .command("install")
    .description("Install hooks that report agent status to work")
    .argument("[target]", "Hook bundle to install (cursor|claude)", "cursor")
    .option("--dry-run", "Show paths without writing files")
    .action((target: string, opts: { dryRun?: boolean }) => {
      if (target !== "cursor" && target !== "claude") {
        console.error(`Unknown hook bundle: ${target}`);
        console.error("Supported targets: cursor, claude");
        process.exit(1);
      }
      installHookBundle(target, opts);
    });

  hooks
    .command("print-env")
    .description(
      "Print env vars to set before launching Cursor/Claude agents in tmux",
    )
    .action(() => {
      const workBin = resolveWorkBin();
      console.log(`export WORK_BIN='${workBin.replace(/'/g, "'\\''")}'`);
    });
}
