import { randomBytes } from "node:crypto";
import {
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
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
  return join(paths.workspacesDir, `${name}.json`);
}

export function loadWorkspace(name: string): WorkspaceState | null {
  try {
    const raw = readFileSync(workspacePath(name), "utf-8");
    return JSON.parse(raw) as WorkspaceState;
  } catch {
    return null;
  }
}

export function saveWorkspace(state: WorkspaceState): void {
  ensureDirs();
  const target = workspacePath(state.name);
  const tmp = `${target}.${randomBytes(4).toString("hex")}.tmp`;
  state.updatedAt = new Date().toISOString();
  writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`);
  renameSync(tmp, target);
}

export function deleteWorkspace(name: string): void {
  try {
    unlinkSync(workspacePath(name));
  } catch {
    // already gone
  }
}

export function listWorkspaces(): WorkspaceState[] {
  ensureDirs();
  const dir = paths.workspacesDir;
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  const results: WorkspaceState[] = [];
  for (const file of files) {
    try {
      const raw = readFileSync(join(dir, file), "utf-8");
      results.push(JSON.parse(raw) as WorkspaceState);
    } catch {
      // skip corrupt files
    }
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
