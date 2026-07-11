import { getConfigValue } from "../config/store.js";
import type { SessionSnapshot } from "../daemon/protocol.js";
import { formatChooseKey, getOption } from "../tmux/client.js";
import { resolveSessionIndex } from "./normalize.js";

export { formatChooseKey } from "../tmux/client.js";

export type SessionShortcutIndexSource = "id" | "choose-order";

export type SessionShortcutContext = {
  chooseIndexByKey: ReadonlyMap<string, number>;
};

let cachedTmuxShortcutKeys: string | null | undefined;
let cachedTmuxIndexSource: SessionShortcutIndexSource | null | undefined;
let indexSourceOverride: SessionShortcutIndexSource | null = null;

function resolveSessionShortcutKeys(): string {
  if (cachedTmuxShortcutKeys === undefined) {
    cachedTmuxShortcutKeys = getOption("global", "@work-session-shortcut-keys");
  }
  return cachedTmuxShortcutKeys ?? getConfigValue("session-shortcut-keys");
}

/** 0-based choose-session list position → shortcut label (configured alphabet). */
export function formatTmuxSessionKey(chooseIndex: number): string {
  return formatChooseKey(chooseIndex, resolveSessionShortcutKeys());
}

/** tmux session id number ($N → N) → choose-session shortcut (0-based). */
export function formatTmuxSessionKeyFromId(sessionIdNumber: number): string {
  return formatTmuxSessionKey(sessionIdNumber - 1);
}

/** Clear cached tmux global shortcut alphabet (for tests). */
export function resetSessionShortcutKeysCache(): void {
  cachedTmuxShortcutKeys = undefined;
}

/** Clear cached tmux global index source (for tests). */
export function resetSessionShortcutIndexCache(): void {
  cachedTmuxIndexSource = undefined;
}

/** Pin index source for unit tests (bypasses tmux globals and work config). */
export function setSessionShortcutIndexSourceOverride(
  source: SessionShortcutIndexSource | null,
): void {
  indexSourceOverride = source;
  cachedTmuxIndexSource = undefined;
}

function parseIndexSource(
  raw: string | null,
): SessionShortcutIndexSource | null {
  if (raw === "id" || raw === "choose-order") return raw;
  return null;
}

export function resolveSessionShortcutIndexSource(): SessionShortcutIndexSource {
  if (indexSourceOverride) return indexSourceOverride;
  if (cachedTmuxIndexSource === undefined) {
    cachedTmuxIndexSource = parseIndexSource(
      getOption("global", "@work-session-shortcut-index"),
    );
  }
  return cachedTmuxIndexSource ?? getConfigValue("session-shortcut-index");
}

function sessionShortcutKey(session: SessionSnapshot): string {
  return `${session.id}\0${session.name}`;
}

/** Match choose-tree -s default sort (-O index): ascending tmux session id. */
export function sortSessionsForChooseTree(
  sessions: SessionSnapshot[],
): SessionSnapshot[] {
  return [...sessions].sort(
    (a, b) => resolveSessionIndex(a) - resolveSessionIndex(b),
  );
}

/** Precompute per-session choose indices once per sidebar render. */
export function createSessionShortcutContext(
  sessions: SessionSnapshot[],
  indexSource: SessionShortcutIndexSource = resolveSessionShortcutIndexSource(),
): SessionShortcutContext {
  const chooseIndexByKey = new Map<string, number>();
  if (indexSource === "choose-order") {
    const sorted = sortSessionsForChooseTree(sessions);
    for (let i = 0; i < sorted.length; i++) {
      chooseIndexByKey.set(sessionShortcutKey(sorted[i]), i);
    }
  } else {
    for (const s of sessions) {
      chooseIndexByKey.set(
        sessionShortcutKey(s),
        Math.max(0, resolveSessionIndex(s) - 1),
      );
    }
  }
  return { chooseIndexByKey };
}

export function chooseIndexFromContext(
  session: SessionSnapshot,
  context: SessionShortcutContext,
): number {
  return (
    context.chooseIndexByKey.get(sessionShortcutKey(session)) ??
    Math.max(0, resolveSessionIndex(session) - 1)
  );
}

export function formatSessionShortcutLabelFromContext(
  session: SessionSnapshot,
  context: SessionShortcutContext,
): string {
  return formatTmuxSessionKey(chooseIndexFromContext(session, context));
}

/** 0-based shortcut index for a session (id → $N-1, choose-order → list position). */
export function resolveSessionShortcutChooseIndex(
  session: SessionSnapshot,
  allSessions: SessionSnapshot[],
  indexSource: SessionShortcutIndexSource = resolveSessionShortcutIndexSource(),
): number {
  return chooseIndexFromContext(
    session,
    createSessionShortcutContext(allSessions, indexSource),
  );
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
