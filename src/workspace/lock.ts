import { closeSync, openSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { paths } from "../config/paths.js";

const MAX_LOCK_ATTEMPTS = 100;
const LOCK_RETRY_MS = 5;

function workspaceLockPath(workspaceName: string): string {
  return join(paths.workspacesDir, `${encodeURIComponent(workspaceName)}.lock`);
}

function sleepMs(ms: number): void {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // busy-wait for short hook-path retries
  }
}

export function withWorkspaceLock<T>(workspaceName: string, fn: () => T): T {
  const lockPath = workspaceLockPath(workspaceName);
  let fd: number | undefined;
  for (let attempt = 0; attempt < MAX_LOCK_ATTEMPTS; attempt++) {
    try {
      fd = openSync(lockPath, "wx");
      break;
    } catch {
      if (attempt === MAX_LOCK_ATTEMPTS - 1) {
        throw new Error(
          `Timed out acquiring workspace lock for ${workspaceName}`,
        );
      }
      sleepMs(LOCK_RETRY_MS);
    }
  }
  try {
    return fn();
  } finally {
    if (fd !== undefined) closeSync(fd);
    try {
      unlinkSync(lockPath);
    } catch {
      // lock file may already be gone
    }
  }
}
