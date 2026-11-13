import { execFileSync } from "node:child_process";

const commandExistsCache = new Map<string, boolean>();

export function commandExists(cmd: string): boolean {
  const cached = commandExistsCache.get(cmd);
  if (cached != null) return cached;

  try {
    execFileSync("sh", ["-c", `command -v ${cmd} >/dev/null 2>&1`], {
      stdio: "ignore",
    });
    commandExistsCache.set(cmd, true);
    return true;
  } catch {
    commandExistsCache.set(cmd, false);
    return false;
  }
}

/**
 * Creating a checkout writes every file in the repo, which can take well over
 * the 10s default on a large repo (ts-grc is ~12k files).
 */
export const CHECKOUT_TIMEOUT_MS = 120_000;

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
    return execFileSync(cmd, args, {
      encoding: "utf-8",
      cwd: opts?.cwd,
      timeout: opts?.timeout ?? 10_000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trimEnd();
  } catch {
    return null;
  }
}
