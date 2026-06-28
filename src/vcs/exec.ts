import { execFileSync } from "node:child_process";

export function commandExists(cmd: string): boolean {
  try {
    execFileSync("sh", ["-c", `command -v ${cmd} >/dev/null 2>&1`], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

export function runCommand(
  cmd: string,
  args: string[],
  opts?: { cwd?: string; timeout?: number },
): string {
  return execFileSync(cmd, args, {
    encoding: "utf-8",
    cwd: opts?.cwd,
    timeout: opts?.timeout ?? 10_000,
  }).trimEnd();
}

export function tryCommand(
  cmd: string,
  args: string[],
  opts?: { cwd?: string; timeout?: number },
): string | null {
  try {
    return runCommand(cmd, args, opts);
  } catch {
    return null;
  }
}
