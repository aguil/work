import { getConfigValue } from "../config/store.js";
import type { SessionSnapshot } from "../daemon/protocol.js";
import { formatTmuxSessionKey, getOption } from "../tmux/client.js";
import { resolveSessionIndex } from "./normalize.js";

export type SessionShortcutIndexSource = "id" | "choose-order";

let cachedTmuxIndexSource: SessionShortcutIndexSource | null | undefined;

/** Clear cached tmux global index source (for tests). */
export function resetSessionShortcutIndexCache(): void {
  cachedTmuxIndexSource = undefined;
}

function parseIndexSource(
  raw: string | null,
): SessionShortcutIndexSource | null {
  if (raw === "id" || raw === "choose-order") return raw;
  return null;
}

export function resolveSessionShortcutIndexSource(): SessionShortcutIndexSource {
  if (cachedTmuxIndexSource === undefined) {
    cachedTmuxIndexSource = parseIndexSource(
      getOption("global", "@work-session-shortcut-index"),
    );
  }
  return cachedTmuxIndexSource ?? getConfigValue("session-shortcut-index");
}

/** Match choose-tree -s default sort (-O index): ascending tmux session id. */
export function sortSessionsForChooseTree(
  sessions: SessionSnapshot[],
): SessionSnapshot[] {
  return [...sessions].sort(
    (a, b) => resolveSessionIndex(a) - resolveSessionIndex(b),
  );
}

/** 0-based shortcut index for a session (id → $N-1, choose-order → list position). */
export function resolveSessionShortcutChooseIndex(
  session: SessionSnapshot,
  allSessions: SessionSnapshot[],
  indexSource: SessionShortcutIndexSource = resolveSessionShortcutIndexSource(),
): number {
  if (indexSource === "choose-order") {
    const sorted = sortSessionsForChooseTree(allSessions);
    const idx = sorted.findIndex(
      (s) => s.id === session.id && s.name === session.name,
    );
    if (idx >= 0) return idx;
  }
  return Math.max(0, resolveSessionIndex(session) - 1);
}

export function formatSessionShortcutLabel(
  session: SessionSnapshot,
  allSessions: SessionSnapshot[],
  indexSource?: SessionShortcutIndexSource,
): string {
  return formatTmuxSessionKey(
    resolveSessionShortcutChooseIndex(
      session,
      allSessions,
      indexSource ?? resolveSessionShortcutIndexSource(),
    ),
  );
}
