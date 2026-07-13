import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { writeJsonAtomic } from "./atomic-json.js";

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "work-atomic-json-test-"));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe("writeJsonAtomic", () => {
  it("writes JSON and leaves no temp file", () => {
    const target = join(tempDir, "nested", "store.json");
    writeJsonAtomic(target, { ok: true });

    assert.equal(existsSync(target), true);
    assert.equal(
      readFileSync(target, "utf-8"),
      `${JSON.stringify({ ok: true }, null, 2)}\n`,
    );
    assert.equal(
      existsSync(`${target}.tmp`),
      false,
      "temp suffix file should not remain",
    );
  });

  it("replaces an existing file atomically", () => {
    const target = join(tempDir, "config.json");
    writeJsonAtomic(target, { version: 1 });
    writeJsonAtomic(target, { version: 2 });

    assert.deepEqual(JSON.parse(readFileSync(target, "utf-8")), {
      version: 2,
    });
  });

  it("honors file mode when provided", () => {
    const target = join(tempDir, "trust.json");
    writeJsonAtomic(target, { repos: [] }, { mode: 0o600 });

    assert.equal(statSync(target).mode & 0o777, 0o600);
  });

  it("does not truncate the target when temp write fails", () => {
    const target = join(tempDir, "config.json");
    writeFileSync(target, `${JSON.stringify({ intact: true })}\n`);

    const blockingParent = join(tempDir, "blocking-file");
    writeFileSync(blockingParent, "not a directory");

    assert.throws(
      () =>
        writeJsonAtomic(join(blockingParent, "nested", "x.json"), {
          broken: true,
        }),
      /ENOTDIR|EEXIST/,
    );
    assert.deepEqual(JSON.parse(readFileSync(target, "utf-8")), {
      intact: true,
    });
  });
});
