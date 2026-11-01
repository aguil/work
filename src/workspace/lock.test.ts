import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { fileURLToPath } from "node:url";
import { paths } from "../config/paths.js";
import {
  LockTimeoutError,
  settleClaim,
  withFileLock,
  withWorkspaceLock,
} from "./lock.js";
import { syncSessionIndexEntry } from "./session-index.js";
import { createWorkspace, loadWorkspace, mutateWorkspace } from "./state.js";

// Re-run as a child to race real waiters: each spins to the same instant.
const RACE_LOCK = process.env.WORK_LOCK_RACE;
if (RACE_LOCK) {
  while (Date.now() < Number(process.env.WORK_LOCK_RACE_AT));
  withFileLock(RACE_LOCK, () => {});
  process.exit(0);
}

function backdate(path: string, ageMs: number): void {
  writeFileSync(path, "");
  const when = new Date(Date.now() - ageMs);
  utimesSync(path, when, when);
}

describe("withFileLock", { concurrency: false }, () => {
  let home: string;
  let lock: string;
  let logged: string[];
  const saved = {
    XDG_STATE_HOME: process.env.XDG_STATE_HOME,
    XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
    XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR,
  };

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "work-lock-test-"));
    process.env.XDG_STATE_HOME = join(home, "state");
    process.env.XDG_CONFIG_HOME = join(home, "config");
    process.env.XDG_RUNTIME_DIR = join(home, "runtime");
    lock = join(home, "x.lock");
    logged = [];
    mock.method(console, "error", (line: string) => logged.push(line));
  });

  afterEach(() => {
    mock.restoreAll();
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(home, { recursive: true, force: true });
  });

  it("recovers a lock older than 30 seconds and logs it", () => {
    backdate(lock, 31_000);

    assert.equal(
      withFileLock(lock, () => "ran"),
      "ran",
    );

    assert.equal(existsSync(lock), false);
    assert.deepEqual(logged, [`work: recovered stale lock ${lock}`]);
  });

  it("leaves a fresher lock alone and logs the timeout", () => {
    backdate(lock, 25_000);
    let ran = false;

    assert.throws(
      () =>
        withFileLock(lock, () => {
          ran = true;
        }),
      LockTimeoutError,
    );

    assert.equal(ran, false);
    assert.equal(existsSync(lock), true);
    assert.deepEqual(logged, [`work: timed out acquiring lock ${lock}`]);
  });

  it("puts back a fresh lock it claimed by mistake", () => {
    const claim = `${lock}.claim`;
    backdate(claim, 1000);

    assert.equal(settleClaim(claim, lock), false);

    assert.equal(existsSync(lock), true);
    assert.equal(existsSync(claim), false);
  });

  it("does not restore a stale lock it claimed", () => {
    const claim = `${lock}.claim`;
    backdate(claim, 31_000);

    assert.equal(settleClaim(claim, lock), true);

    assert.equal(existsSync(lock), false);
    assert.equal(existsSync(claim), false);
  });

  it("recovers a stale workspace lock", () => {
    createWorkspace("w", "s", true);
    backdate(join(paths.workspacesDir, "w.lock"), 31_000);

    mutateWorkspace("w", (ws) => {
      ws.archived = true;
      return true;
    });

    assert.equal(loadWorkspace("w")?.archived, true);
    assert.equal(logged.length, 1);
  });

  it("leaves a fresh workspace lock alone", () => {
    createWorkspace("w", "s", true);
    backdate(join(paths.workspacesDir, "w.lock"), 1000);

    assert.throws(() => withWorkspaceLock("w", () => {}), LockTimeoutError);
  });

  it("recovers a stale session index lock, and leaves a fresh one", () => {
    const ws = createWorkspace("w", "s", true);
    const indexLock = join(paths.state, "session-index.lock");
    backdate(indexLock, 31_000);

    syncSessionIndexEntry(ws);
    assert.equal(logged.length, 1);

    backdate(indexLock, 1000);
    assert.throws(() => syncSessionIndexEntry(ws), LockTimeoutError);
  });

  it("lets one of several racing waiters take over a stale lock", async () => {
    backdate(lock, 31_000);
    const at = Date.now() + 300;
    const script = fileURLToPath(import.meta.url);
    const runs = Array.from({ length: 8 }, () => race(script, lock, at));

    const stderr = (await Promise.all(runs)).join("");

    assert.equal(stderr.match(/recovered stale lock/g)?.length, 1);
    assert.deepEqual(
      readdirSync(home).filter((f) => f.startsWith("x.lock")),
      [],
    );
  });
});

function race(script: string, lockPath: string, at: number): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script], {
      env: {
        ...process.env,
        WORK_LOCK_RACE: lockPath,
        WORK_LOCK_RACE_AT: String(at),
      },
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", () => resolve(stderr));
  });
}
