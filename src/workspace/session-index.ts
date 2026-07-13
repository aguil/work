import { type Dirent, existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ensureDirs, paths } from "../config/paths.js";
import { writeJsonAtomic } from "../util/atomic-json.js";
import { withFileLock } from "./lock.js";

export interface SessionIndexEntry {
  name: string;
  archived: boolean;
}

interface SessionIndex {
  bySession: Record<string, SessionIndexEntry>;
}

interface WorkspaceIndexFields {
  name: string;
  sessionName: string;
  archived: boolean;
}

function sessionIndexPath(): string {
  return join(paths.state, "session-index.json");
}

function sessionIndexLockPath(): string {
  return join(paths.state, "session-index.lock");
}

function withSessionIndexLock<T>(fn: () => T): T {
  return withFileLock(sessionIndexLockPath(), fn);
}

function emptyIndex(): SessionIndex {
  return { bySession: {} };
}

function loadIndex(): SessionIndex {
  ensureDirs();
  const path = sessionIndexPath();
  if (!existsSync(path)) return emptyIndex();
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8")) as SessionIndex;
    return { bySession: raw.bySession ?? {} };
  } catch {
    return emptyIndex();
  }
}

function saveIndex(index: SessionIndex): void {
  ensureDirs();
  writeJsonAtomic(sessionIndexPath(), index, { mode: 0o600 });
}

function collectWorkspaceJsonFiles(dir: string): string[] {
  const files: string[] = [];
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectWorkspaceJsonFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(full);
    }
  }
  return files;
}

function readWorkspaceIndexFields(path: string): WorkspaceIndexFields | null {
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8")) as WorkspaceIndexFields;
    if (
      typeof raw.name !== "string" ||
      typeof raw.sessionName !== "string" ||
      typeof raw.archived !== "boolean"
    ) {
      return null;
    }
    return raw;
  } catch {
    return null;
  }
}

export function rebuildSessionIndex(): void {
  ensureDirs();
  withSessionIndexLock(() => {
    const index = emptyIndex();
    for (const filePath of collectWorkspaceJsonFiles(paths.workspacesDir)) {
      const fields = readWorkspaceIndexFields(filePath);
      if (!fields) continue;
      index.bySession[fields.sessionName] = {
        name: fields.name,
        archived: fields.archived,
      };
    }
    saveIndex(index);
  });
}

export function syncSessionIndexEntry(state: {
  name: string;
  sessionName: string;
  archived: boolean;
}): void {
  ensureDirs();
  withSessionIndexLock(() => {
    const index = loadIndex();
    index.bySession[state.sessionName] = {
      name: state.name,
      archived: state.archived,
    };
    saveIndex(index);
  });
}

export function removeSessionIndexEntry(sessionName: string): void {
  ensureDirs();
  withSessionIndexLock(() => {
    const index = loadIndex();
    if (!(sessionName in index.bySession)) return;
    delete index.bySession[sessionName];
    saveIndex(index);
  });
}

export function lookupSessionIndexEntry(
  sessionName: string,
): SessionIndexEntry | null {
  return loadIndex().bySession[sessionName] ?? null;
}
