import { randomBytes } from "node:crypto";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface WriteJsonAtomicOptions {
  mode?: number;
}

export function writeJsonAtomic(
  targetPath: string,
  value: unknown,
  options?: WriteJsonAtomicOptions,
): void {
  mkdirSync(dirname(targetPath), { recursive: true });
  const tmp = `${targetPath}.${randomBytes(4).toString("hex")}.tmp`;
  const payload = `${JSON.stringify(value, null, 2)}\n`;
  if (options?.mode !== undefined) {
    writeFileSync(tmp, payload, { mode: options.mode });
  } else {
    writeFileSync(tmp, payload);
  }
  renameSync(tmp, targetPath);
}
