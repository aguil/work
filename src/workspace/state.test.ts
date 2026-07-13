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

let isolatedHome: string;
const savedEnv = {
  state: process.env.XDG_STATE_HOME,
  config: process.env.XDG_CONFIG_HOME,
  runtime: process.env.XDG_RUNTIME_DIR,
};

function workspacesDir(home: string): string {
  return join(home, "state", "work", "workspaces");
}

function workspaceState(name: string, sessionName = name) {
  return {
    name,
    sessionName,
    agents: {},
    trees: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    createdByWork: false,
    archived: false,
  };
}

beforeEach(() => {
  isolatedHome = mkdtempSync(join(tmpdir(), "work-state-test-"));
  process.env.XDG_STATE_HOME = join(isolatedHome, "state");
  process.env.XDG_CONFIG_HOME = join(isolatedHome, "config");
  process.env.XDG_RUNTIME_DIR = join(isolatedHome, "runtime");
});

afterEach(() => {
  for (const [key, saved] of [
    ["XDG_STATE_HOME", savedEnv.state],
    ["XDG_CONFIG_HOME", savedEnv.config],
    ["XDG_RUNTIME_DIR", savedEnv.runtime],
  ] as const) {
    if (saved === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = saved;
    }
  }
  rmSync(isolatedHome, { recursive: true, force: true });
});

describe("workspace state", () => {
  it("stores workspace names containing slashes as a single encoded file", async () => {
    const { createWorkspace, deleteWorkspace, listWorkspaces, loadWorkspace } =
      await import("./state.js");
    const name = "aguil/dotfiles";

    createWorkspace(name, name, false);

    const statePath = join(
      workspacesDir(isolatedHome),
      "aguil%2Fdotfiles.json",
    );
    const nestedStatePath = join(
      workspacesDir(isolatedHome),
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
      workspacesDir(isolatedHome),
      "aguil",
      "dotfiles.json",
    );
    const encodedPath = join(
      workspacesDir(isolatedHome),
      "aguil%2Fdotfiles.json",
    );
    mkdirSync(dirname(legacyPath), { recursive: true });
    writeFileSync(legacyPath, `${JSON.stringify(workspaceState(name))}\n`);

    assert.equal(loadWorkspace(name)?.name, name);
    assert.equal(existsSync(encodedPath), true);
    assert.equal(existsSync(legacyPath), false);
  });

  it("migrates legacy space-containing workspace on list", async () => {
    const { listWorkspaces } = await import("./state.js");
    const name = "my project";
    const legacyPath = join(workspacesDir(isolatedHome), "my project.json");
    const encodedPath = join(workspacesDir(isolatedHome), "my%20project.json");
    mkdirSync(dirname(legacyPath), { recursive: true });
    writeFileSync(legacyPath, `${JSON.stringify(workspaceState(name))}\n`);

    assert.deepEqual(
      listWorkspaces().map((workspace) => workspace.name),
      [name],
    );
    assert.equal(existsSync(encodedPath), true);
    assert.equal(existsSync(legacyPath), false);
  });

  it("removes legacy duplicate when canonical workspace file exists", async () => {
    const { listWorkspaces, loadWorkspace } = await import("./state.js");
    const name = "aguil/dotfiles";
    const wsDir = workspacesDir(isolatedHome);
    const canonicalPath = join(wsDir, "aguil%2Fdotfiles.json");
    const legacyPath = join(wsDir, "aguil", "dotfiles.json");
    mkdirSync(dirname(legacyPath), { recursive: true });
    writeFileSync(
      canonicalPath,
      `${JSON.stringify({
        ...workspaceState(name),
        agents: {
          current: {
            label: "current",
            cli: "x",
            paneId: null,
            status: "idle",
            confidence: "none",
            detachedAt: null,
            lastSeen: "2026-01-01T00:00:00.000Z",
          },
        },
      })}\n`,
    );
    writeFileSync(
      legacyPath,
      `${JSON.stringify({
        ...workspaceState(name),
        agents: {
          old: {
            label: "old",
            cli: "x",
            paneId: null,
            status: "idle",
            confidence: "none",
            detachedAt: null,
            lastSeen: "2026-01-01T00:00:00.000Z",
          },
        },
      })}\n`,
    );

    assert.deepEqual(Object.keys(loadWorkspace(name)?.agents ?? {}), [
      "current",
    ]);
    assert.equal(existsSync(legacyPath), false);

    mkdirSync(dirname(legacyPath), { recursive: true });
    writeFileSync(
      legacyPath,
      `${JSON.stringify({
        ...workspaceState(name),
        agents: {
          old: {
            label: "old",
            cli: "x",
            paneId: null,
            status: "idle",
            confidence: "none",
            detachedAt: null,
            lastSeen: "2026-01-01T00:00:00.000Z",
          },
        },
      })}\n`,
    );
    listWorkspaces();
    assert.equal(existsSync(legacyPath), false);
    assert.equal(existsSync(canonicalPath), true);
  });
});
