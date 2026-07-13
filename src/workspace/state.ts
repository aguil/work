import { randomBytes } from "node:crypto";
import {
  type Dirent,
  readdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { ensureDirs, paths } from "../config/paths.js";

export type AgentStatus =
  | "idle"
  | "working"
  | "blocked"
  | "done"
  | "error"
  | "detached"
  | "unknown";

export interface AgentRecord {
  label: string;
  cli: string;
  paneId: string | null;
  status: AgentStatus;
  confidence: "explicit" | "inferred" | "heuristic" | "none";
  detachedAt: string | null;
  lastSeen: string;
  pendingIdleCount?: number;
  conversationId?: string | null;
  hookEvent?: string | null;
  // Screen-derived metadata below is only meaningful while `status` came
  // from observation (confidence inferred/heuristic); explicit hook status
  // clears it and detached agents should be rendered from `status` alone.
  /** Semantic reason for the current screen-derived status (rule ID). */
  statusReason?: string | null;
  /** Snippet of the screen region behind the current status (e.g. prompt). */
  statusEvidence?: string | null;
  /** Blocker chrome is visibly on screen (needs input right now). */
  visibleBlocker?: boolean;
}

export interface TreeRecord {
  path: string;
  vcsType: "git" | "jj" | "plain";
  branch: string | null;
  createdByWork: boolean;
}

export interface WorkspaceState {
  name: string;
  sessionName: string;
  agents: Record<string, AgentRecord>;
  trees: TreeRecord[];
  createdAt: string;
  updatedAt: string;
  createdByWork: boolean;
  archived: boolean;
}

function workspacePath(name: string): string {
  return join(paths.workspacesDir, `${encodeURIComponent(name)}.json`);
}

/** Pre-0.1.5 on-disk layout: `${name}.json` (slashes became nested directories). */
function legacyWorkspacePath(name: string): string {
  return join(paths.workspacesDir, `${name}.json`);
}

function readWorkspaceFile(path: string): WorkspaceState | null {
  try {
    const raw = readFileSync(path, "utf-8");
    return JSON.parse(raw) as WorkspaceState;
  } catch {
    return null;
  }
}

function removeLegacyWorkspaceFile(filePath: string): void {
  try {
    unlinkSync(filePath);
  } catch {
    return;
  }
  let dir = dirname(filePath);
  const root = paths.workspacesDir;
  while (dir.startsWith(root) && dir !== root) {
    try {
      if (readdirSync(dir).length === 0) {
        rmdirSync(dir);
        dir = dirname(dir);
      } else {
        break;
      }
    } catch {
      break;
    }
  }
}

function migrateLegacyWorkspaceFile(
  name: string,
  filePath: string,
  state: WorkspaceState,
): void {
  const canonical = workspacePath(name);
  if (filePath === canonical) return;
  saveWorkspace(state);
  if (filePath !== legacyWorkspacePath(name)) {
    removeLegacyWorkspaceFile(filePath);
  }
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

export function loadWorkspace(name: string): WorkspaceState | null {
  const currentPath = workspacePath(name);
  const current = readWorkspaceFile(currentPath);
  if (current) return current;

  const legacyPath = legacyWorkspacePath(name);
  if (legacyPath === currentPath) return null;

  const legacy = readWorkspaceFile(legacyPath);
  if (!legacy) return null;

  saveWorkspace(legacy);
  removeLegacyWorkspaceFile(legacyPath);
  return legacy;
}

export function saveWorkspace(state: WorkspaceState): void {
  ensureDirs();
  const target = workspacePath(state.name);
  const tmp = `${target}.${randomBytes(4).toString("hex")}.tmp`;
  state.updatedAt = new Date().toISOString();
  // Owner-only: agent records carry pane-derived text (status evidence).
  writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, target);
  const legacy = legacyWorkspacePath(state.name);
  if (legacy !== target) {
    removeLegacyWorkspaceFile(legacy);
  }
}

export function deleteWorkspace(name: string): void {
  removeLegacyWorkspaceFile(workspacePath(name));
  const legacy = legacyWorkspacePath(name);
  if (legacy !== workspacePath(name)) {
    removeLegacyWorkspaceFile(legacy);
  }
}

export function listWorkspaces(): WorkspaceState[] {
  ensureDirs();
  const filePaths = collectWorkspaceJsonFiles(paths.workspacesDir);
  const byName = new Map<string, { path: string; state: WorkspaceState }>();
  for (const filePath of filePaths) {
    const state = readWorkspaceFile(filePath);
    if (!state) continue;
    const canonical = workspacePath(state.name);
    const existing = byName.get(state.name);
    if (!existing || filePath === canonical) {
      byName.set(state.name, { path: filePath, state });
    }
  }
  const results: WorkspaceState[] = [];
  for (const [name, { path, state }] of byName) {
    const canonical = workspacePath(name);
    if (path !== canonical) {
      migrateLegacyWorkspaceFile(name, path, state);
    }
    results.push(state);
  }
  return results;
}

export function createWorkspace(
  name: string,
  sessionName: string,
  createdByWork: boolean,
): WorkspaceState {
  const now = new Date().toISOString();
  const state: WorkspaceState = {
    name,
    sessionName,
    agents: {},
    trees: [],
    createdAt: now,
    updatedAt: now,
    createdByWork,
    archived: false,
  };
  saveWorkspace(state);
  return state;
}

export function findWorkspaceBySession(
  sessionName: string,
): WorkspaceState | null {
  const all = listWorkspaces();
  return all.find((w) => !w.archived && w.sessionName === sessionName) ?? null;
}

export function findArchivedWorkspaceBySession(
  sessionName: string,
): WorkspaceState | null {
  const all = listWorkspaces();
  return all.find((w) => w.archived && w.sessionName === sessionName) ?? null;
}

export function unarchiveWorkspace(ws: WorkspaceState): WorkspaceState {
  ws.archived = false;
  saveWorkspace(ws);
  return ws;
}

export function upsertAgent(
  workspace: WorkspaceState,
  agent: AgentRecord,
): void {
  workspace.agents[agent.label] = agent;
}

export function findAgentByPane(
  workspace: WorkspaceState,
  paneId: string,
): AgentRecord | undefined {
  return Object.values(workspace.agents).find((a) => a.paneId === paneId);
}

export function findAgentByConversation(
  workspace: WorkspaceState,
  conversationId: string,
): AgentRecord | undefined {
  return Object.values(workspace.agents).find(
    (a) => a.conversationId === conversationId,
  );
}

export function agentKey(workspaceName: string, label: string): string {
  return `${workspaceName}:${label}`;
}

function generateLabel(cli: string, existing: string[]): string {
  const base = basename(cli);
  if (!existing.includes(base)) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base}-${i}`;
    if (!existing.includes(candidate)) return candidate;
  }
}

export function autoLabel(cli: string, workspace: WorkspaceState): string {
  const existingLabels = Object.keys(workspace.agents);
  return generateLabel(cli, existingLabels);
}
