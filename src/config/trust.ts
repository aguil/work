import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { ensureDirs, paths } from "./paths.js";

interface TrustStore {
  repos: string[];
}

function trustPath(): string {
  return paths.trustFile;
}

function loadStore(): TrustStore {
  ensureDirs();
  try {
    const raw = readFileSync(trustPath(), "utf-8");
    const parsed = JSON.parse(raw) as TrustStore;
    return { repos: parsed.repos ?? [] };
  } catch {
    return { repos: [] };
  }
}

function saveStore(store: TrustStore): void {
  ensureDirs();
  mkdirSync(dirname(trustPath()), { recursive: true });
  writeFileSync(trustPath(), `${JSON.stringify(store, null, 2)}\n`);
}

export function normalizeTrustPath(input: string): string {
  const abs = resolve(input);
  if (!existsSync(abs)) {
    throw new Error(`Path not found: ${input}`);
  }
  return realpathSync(abs);
}

export function listTrustedRepos(): string[] {
  return [...loadStore().repos].sort();
}

export function isPathTrusted(input: string): boolean {
  let abs: string;
  try {
    abs = normalizeTrustPath(input);
  } catch {
    return false;
  }

  return loadStore().repos.some(
    (trusted) => abs === trusted || abs.startsWith(`${trusted}/`),
  );
}

export function addTrustedRepo(input: string): string {
  const abs = normalizeTrustPath(input);
  const store = loadStore();
  if (store.repos.includes(abs)) return abs;
  store.repos.push(abs);
  saveStore(store);
  return abs;
}

export function removeTrustedRepo(input: string): boolean {
  const abs = normalizeTrustPath(input);
  const store = loadStore();
  const next = store.repos.filter((p) => p !== abs);
  if (next.length === store.repos.length) return false;
  store.repos = next;
  saveStore(store);
  return true;
}
