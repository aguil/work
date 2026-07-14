import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { resolveCheckoutBase } from "./checkout.js";
import type { WorkspaceState } from "./state.js";

let home: string;
const savedConfig = process.env.XDG_CONFIG_HOME;

function ws(name: string): WorkspaceState {
  return {
    name,
    sessionName: name,
    agents: {},
    trees: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    createdByWork: false,
    archived: false,
  } as WorkspaceState;
}

function setCheckoutBase(value: string): void {
  const dir = join(home, "config", "work");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "config.json"),
    JSON.stringify({ "checkout-base": value }),
  );
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "work-checkout-test-"));
  process.env.XDG_CONFIG_HOME = join(home, "config");
});

afterEach(() => {
  if (savedConfig === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = savedConfig;
  rmSync(home, { recursive: true, force: true });
});

describe("resolveCheckoutBase", () => {
  it("appends the session name to a shared checkout-base root", () => {
    setCheckoutBase("/projects");
    assert.equal(
      resolveCheckoutBase(ws("remediation")),
      "/projects/remediation",
    );
  });

  it("uses checkout-base as-is when already named for the session", () => {
    setCheckoutBase("/projects/remediation");
    assert.equal(
      resolveCheckoutBase(ws("remediation")),
      "/projects/remediation",
    );
  });
});
