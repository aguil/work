import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  lookupSessionIndexEntry,
  rebuildSessionIndex,
  syncSessionIndexEntry,
} from "./session-index.js";
import {
  createWorkspace,
  loadWorkspace,
  loadWorkspacesForSession,
  mutateWorkspace,
  saveWorkspace,
} from "./state.js";

describe("hook workspace state", { concurrency: false }, () => {
  let isolatedHome: string;
  const savedEnv = {
    state: process.env.XDG_STATE_HOME,
    config: process.env.XDG_CONFIG_HOME,
    runtime: process.env.XDG_RUNTIME_DIR,
  };

  beforeEach(() => {
    isolatedHome = mkdtempSync(join(tmpdir(), "work-hook-state-test-"));
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
    try {
      unlinkSync(join(isolatedHome, "state", "work", "session-index.lock"));
    } catch {
      // ignore
    }
    rmSync(isolatedHome, { recursive: true, force: true });
  });

  describe("session index", () => {
    it("loads workspace by session without scanning every file", () => {
      createWorkspace("proj-a", "sess-a", false);
      rebuildSessionIndex();

      const entry = lookupSessionIndexEntry("sess-a");
      assert.equal(entry?.name, "proj-a");
      assert.equal(loadWorkspacesForSession("sess-a").active?.name, "proj-a");
    });

    it("updates index when archived flag changes", () => {
      const ws = createWorkspace("proj-b", "sess-b", false);
      ws.archived = true;
      saveWorkspace(ws);

      assert.equal(lookupSessionIndexEntry("sess-b")?.archived, true);
      assert.equal(loadWorkspacesForSession("sess-b").active, null);
      assert.equal(loadWorkspacesForSession("sess-b").archived?.name, "proj-b");
    });
  });

  describe("mutateWorkspace", () => {
    it("serializes updates through locked read-modify-write", () => {
      createWorkspace("proj-lock", "sess-lock", false);

      mutateWorkspace("proj-lock", (ws) => {
        ws.agents.agent = {
          label: "agent",
          cli: "agent",
          paneId: "%1",
          status: "idle",
          confidence: "explicit",
          detachedAt: null,
          lastSeen: new Date().toISOString(),
        };
        return true;
      });

      mutateWorkspace("proj-lock", (ws) => {
        const agent = ws.agents.agent;
        assert.ok(agent);
        agent.status = "blocked";
        return true;
      });

      assert.equal(loadWorkspace("proj-lock")?.agents.agent?.status, "blocked");
      assert.equal(
        existsSync(
          join(
            isolatedHome,
            "state",
            "work",
            "workspaces",
            `${encodeURIComponent("proj-lock")}.lock`,
          ),
        ),
        false,
      );
    });

    it("persists unarchive when applied inside locked mutation", () => {
      const ws = createWorkspace("arch-proj", "arch-sess", false);
      ws.archived = true;
      saveWorkspace(ws);

      mutateWorkspace("arch-proj", (state) => {
        if (!state.archived) return false;
        state.archived = false;
        return true;
      });

      assert.equal(loadWorkspace("arch-proj")?.archived, false);
      assert.equal(lookupSessionIndexEntry("arch-sess")?.archived, false);
    });
  });

  describe("syncSessionIndexEntry", () => {
    it("persists session lookup entries", () => {
      syncSessionIndexEntry({
        name: "manual",
        sessionName: "manual-session",
        archived: false,
      });
      assert.deepEqual(lookupSessionIndexEntry("manual-session"), {
        name: "manual",
        archived: false,
      });
    });
  });
});
