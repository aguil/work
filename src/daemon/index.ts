import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { ensureDirs, paths } from "../config/paths.js";
import { DaemonServer } from "./server.js";

function writePidFile(): void {
  ensureDirs();
  writeFileSync(paths.pidFile, `${String(process.pid)}\n`);
}

function removePidFile(): void {
  try {
    unlinkSync(paths.pidFile);
  } catch {
    // already gone
  }
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForSocketFile(timeoutMs = 1000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    if (existsSync(paths.socketPath)) return true;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return existsSync(paths.socketPath);
}

export function readPidFile(): number | null {
  try {
    const raw = readFileSync(paths.pidFile, "utf-8").trim();
    const pid = parseInt(raw, 10);
    return Number.isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

export function isDaemonRunning(): boolean {
  const pid = readPidFile();
  if (pid == null) return false;
  if (!isProcessRunning(pid)) {
    removePidFile();
    return false;
  }
  return true;
}

async function main(): Promise<void> {
  if (isDaemonRunning()) {
    const pid = readPidFile();
    console.error(`workd already running (pid ${pid})`);
    process.exit(1);
  }

  ensureDirs();

  const server = new DaemonServer();

  function shutdown(): void {
    removePidFile();
    server.stop().then(() => process.exit(0));
  }

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  process.on("SIGHUP", shutdown);

  process.on("uncaughtException", (err) => {
    console.error("workd uncaught exception:", err);
    removePidFile();
    process.exit(1);
  });

  try {
    await server.start();
    writePidFile();
    if (!(await waitForSocketFile())) {
      console.error("Socket file not created");
      process.exit(1);
    }
    console.log(`workd started (pid ${process.pid})`);
    console.log(`Socket: ${paths.socketPath}`);
  } catch (err) {
    console.error("Failed to start workd:", err);
    removePidFile();
    process.exit(1);
  }
}

main();
