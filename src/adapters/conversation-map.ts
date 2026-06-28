import {
  readFileSync,
  writeFileSync,
  renameSync,
  mkdirSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";
import { paths, ensureDirs } from "../config/paths.js";

export interface ConversationBinding {
  conversationId: string;
  paneId: string | null;
  sessionName: string | null;
  workspaceName: string | null;
  cwd: string | null;
  updatedAt: string;
}

function mapPath(): string {
  return join(paths.state, "conversation-map.json");
}

function loadAll(): Record<string, ConversationBinding> {
  ensureDirs();
  try {
    const raw = readFileSync(mapPath(), "utf-8");
    return JSON.parse(raw) as Record<string, ConversationBinding>;
  } catch {
    return {};
  }
}

function saveAll(map: Record<string, ConversationBinding>): void {
  ensureDirs();
  const target = mapPath();
  mkdirSync(dirname(target), { recursive: true });
  const tmp = target + "." + randomBytes(4).toString("hex") + ".tmp";
  writeFileSync(tmp, JSON.stringify(map, null, 2) + "\n");
  renameSync(tmp, target);
}

export function getConversationBinding(
  conversationId: string,
): ConversationBinding | null {
  return loadAll()[conversationId] ?? null;
}

export function getBindingByPane(paneId: string): ConversationBinding | null {
  for (const binding of Object.values(loadAll())) {
    if (binding.paneId === paneId) return binding;
  }
  return null;
}

export function upsertConversationBinding(
  binding: Omit<ConversationBinding, "updatedAt">,
): ConversationBinding {
  const map = loadAll();
  const record: ConversationBinding = {
    ...binding,
    updatedAt: new Date().toISOString(),
  };
  map[binding.conversationId] = record;
  saveAll(map);
  return record;
}

export function removeConversationBinding(conversationId: string): void {
  const map = loadAll();
  if (!(conversationId in map)) return;
  delete map[conversationId];
  saveAll(map);
}
