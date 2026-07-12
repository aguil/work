import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

let isolatedStateHome: string;
const savedStateHome = process.env.XDG_STATE_HOME;

beforeEach(() => {
  isolatedStateHome = mkdtempSync(join(tmpdir(), "work-state-test-"));
  process.env.XDG_STATE_HOME = isolatedStateHome;
});

afterEach(() => {
  if (savedStateHome === undefined) {
    delete process.env.XDG_STATE_HOME;
  } else {
    process.env.XDG_STATE_HOME = savedStateHome;
  }
  rmSync(isolatedStateHome, { recursive: true, force: true });
});

describe("workspace state", () => {
  it("stores workspace names containing slashes as a single encoded file", async () => {
    const { createWorkspace, deleteWorkspace, listWorkspaces, loadWorkspace } =
      await import("./state.js");
    const name = "aguil/dotfiles";

    createWorkspace(name, name, false);

    const statePath = join(
      isolatedStateHome,
      "work",
      "workspaces",
      "aguil%2Fdotfiles.json",
    );
    const nestedStatePath = join(
      isolatedStateHome,
      "work",
      "workspaces",
      "aguil",
      "dotfiles.json",
    );

    assert.equal(existsSync(statePath), true);
    assert.equal(existsSync(nestedStatePath), false);
    assert.equal(loadWorkspace(name)?.name, name);
    assert.deepEqual(
      listWorkspaces().map((workspace) => workspace.name),
      [name],
    );

    deleteWorkspace(name);
    assert.equal(existsSync(statePath), false);
  });
});
