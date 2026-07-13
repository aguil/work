import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
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

  it("migrates legacy nested slash workspace on load", async () => {
    const { loadWorkspace } = await import("./state.js");
    const name = "aguil/dotfiles";
    const legacyPath = join(
      isolatedStateHome,
      "work",
      "workspaces",
      "aguil",
      "dotfiles.json",
    );
    const encodedPath = join(
      isolatedStateHome,
      "work",
      "workspaces",
      "aguil%2Fdotfiles.json",
    );
    mkdirSync(dirname(legacyPath), { recursive: true });
    writeFileSync(
      legacyPath,
      `${JSON.stringify({
        name,
        sessionName: name,
        agents: {},
        trees: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        createdByWork: false,
        archived: false,
      })}\n`,
    );

    assert.equal(loadWorkspace(name)?.name, name);
    assert.equal(existsSync(encodedPath), true);
    assert.equal(existsSync(legacyPath), false);
  });

  it("migrates legacy space-containing workspace on list", async () => {
    const { listWorkspaces } = await import("./state.js");
    const name = "my project";
    const legacyPath = join(
      isolatedStateHome,
      "work",
      "workspaces",
      "my project.json",
    );
    const encodedPath = join(
      isolatedStateHome,
      "work",
      "workspaces",
      "my%20project.json",
    );
    mkdirSync(dirname(legacyPath), { recursive: true });
    writeFileSync(
      legacyPath,
      `${JSON.stringify({
        name,
        sessionName: name,
        agents: {},
        trees: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        createdByWork: false,
        archived: false,
      })}\n`,
    );

    assert.deepEqual(
      listWorkspaces().map((workspace) => workspace.name),
      [name],
    );
    assert.equal(existsSync(encodedPath), true);
    assert.equal(existsSync(legacyPath), false);
  });
});
