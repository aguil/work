import { randomUUID } from "node:crypto";
import { closeSync, openSync, renameSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { paths } from "../config/paths.js";

const MAX_LOCK_ATTEMPTS = 100;
const LOCK_RETRY_MS = 5;
export const STALE_LOCK_MS = 30_000;

function sleepMs(ms: number): void {
  if (ms <= 0) return;
  const buffer = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(buffer), 0, 0, ms);
}

function isStale(path: string): boolean {
  try {
    return Date.now() - statSync(path).mtimeMs > STALE_LOCK_MS;
  } catch {
    return false;
  }
}

/**
 * A process killed under a lock leaves its file for good. `rename` is atomic,
 * so of two waiters only one claims it. A waiter that read the age just before
 * another took over can still claim that fresh lock, and both then hold it:
 * the small window JC-25 accepts. Restoring the file would be worse, since its
 * owner may already have finished, leaving a lock nobody holds.
 */
function claimStaleLock(lockPath: string): boolean {
  if (!isStale(lockPath)) return false;
  const claim = `${lockPath}.${randomUUID()}`;
  try {
    renameSync(lockPath, claim);
  } catch {
    return false;
  }
  const stale = isStale(claim);
  try {
    unlinkSync(claim);
  } catch {
    // already gone
  }
  if (stale) console.error(`work: recovered stale lock ${lockPath}`);
  return stale;
}

export class LockTimeoutError extends Error {}

export function withFileLock<T>(lockPath: string, fn: () => T): T {
  let fd: number | undefined;
  let attempts = 0;
  while (fd === undefined) {
    try {
      fd = openSync(lockPath, "wx");
    } catch {
      if (claimStaleLock(lockPath)) continue;
      if (++attempts === MAX_LOCK_ATTEMPTS) {
        console.error(`work: timed out acquiring lock ${lockPath}`);
        throw new LockTimeoutError(`Timed out acquiring lock: ${lockPath}`);
      }
      sleepMs(LOCK_RETRY_MS);
    }
  }
  try {
    return fn();
  } finally {
    closeSync(fd);
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
