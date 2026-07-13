import { closeSync, openSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { paths } from "../config/paths.js";

const MAX_LOCK_ATTEMPTS = 100;
const LOCK_RETRY_MS = 5;

function sleepMs(ms: number): void {
  if (ms <= 0) return;
  const buffer = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(buffer), 0, 0, ms);
}

export function withFileLock<T>(lockPath: string, fn: () => T): T {
  let fd: number | undefined;
  for (let attempt = 0; attempt < MAX_LOCK_ATTEMPTS; attempt++) {
    try {
      fd = openSync(lockPath, "wx");
      break;
    } catch {
      if (attempt === MAX_LOCK_ATTEMPTS - 1) {
        throw new Error(`Timed out acquiring lock: ${lockPath}`);
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

export function withWorkspaceLock<T>(workspaceName: string, fn: () => T): T {
  const lockPath = join(
    paths.workspacesDir,
    `${encodeURIComponent(workspaceName)}.lock`,
  );
  return withFileLock(lockPath, fn);
}
