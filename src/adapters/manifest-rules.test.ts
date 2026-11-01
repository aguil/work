import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { isActiveAgentTitle } from "./agent-title.js";
import { mapHookEventToStatus } from "./hook-events.js";
import { parseManifestFile } from "./loader.js";
import { observeWithManifest } from "./observe.js";

const CLAUDE_TOML = "src/adapters/manifests/claude.toml";
const CURSOR_TOML = "src/adapters/manifests/cursor.toml";

function statusFrom(toml: string, paneTitle: string, bottomLines: string) {
  const manifest = parseManifestFile(toml);
  assert.ok(manifest);
  return observeWithManifest({ paneTitle, bottomLines }, manifest)?.status;
}

function claudeStatus(bottomLines: string) {
  return statusFrom(CLAUDE_TOML, "claude", bottomLines);
}

function cursorStatus(paneTitle: string, bottomLines = "") {
  return statusFrom(CURSOR_TOML, paneTitle, bottomLines);
}

// Bottom of the shell approval as captured on cursor-agent 2026.10.22.
const CURSOR_APPROVAL_FRAME = `
 $  touch cv-CVTOKEN in .

 Run this command?
 Shell allowlist is empty
  → Run (once) (y)
    Add Shell(touch) to allowlist? (tab)
    Run Everything (shift+tab)
    Skip & tell the agent what to do instead (esc or n)`;

// Bottom of the permission dialog as captured on Claude Code 2.1.312.
const CLAUDE_DIALOG_FRAME = `
 Do you want to proceed?
 ❯ 1. Yes
   2. Yes, and always allow access to /tmp/cv from this project
   3. Yes, and switch to auto mode · auto mode handles these prompts for you
   4. No

 Esc to cancel · Tab to amend`;

describe("claude.toml on Claude Code 2.1.312", () => {
  it("reads the permission dialog as blocked", () => {
    assert.equal(claudeStatus(CLAUDE_DIALOG_FRAME), "blocked");
  });

  it("reads the 2. Yes option line as blocked", () => {
    assert.equal(claudeStatus("   2. Yes, and always allow"), "blocked");
  });

  it("reads the 3. Yes option line as blocked", () => {
    assert.equal(claudeStatus("   3. Yes, and switch to auto mode"), "blocked");
  });

  it("does not read Do you want to proceed in agent prose as blocked", () => {
    assert.notEqual(
      claudeStatus(
        "Do you want to proceed with the migration?\n\n────\n❯\n────",
      ),
      "blocked",
    );
  });

  it("does not read a numbered reply on the prompt line as blocked", () => {
    assert.notEqual(
      claudeStatus("────\n❯ 1. Yes, do the first one\n────"),
      "blocked",
    );
  });

  it("reads the working footer as working", () => {
    assert.equal(
      claudeStatus("❯\n⏸ manual mode on · esc to interrupt · ← 1 agents"),
      "working",
    );
  });

  it("reads idle from the measured hook payloads", () => {
    assert.equal(mapHookEventToStatus("Stop", {}), "idle");
    assert.equal(
      mapHookEventToStatus("Notification", {
        notification_type: "idle_prompt",
      }),
      "idle",
    );
  });
});

describe("cursor.toml on cursor-agent 2026.10.22", () => {
  it("reads a confirmation title as blocked", () => {
    assert.equal(
      cursorStatus("Shell Command Run - 🔐 Waiting for confirmation"),
      "blocked",
    );
  });

  it("reads a question title as blocked", () => {
    assert.equal(
      cursorStatus("Choose Your Option - ❓ Waiting for you"),
      "blocked",
    );
  });

  it("reads the plain approval prompt as blocked", () => {
    assert.equal(
      cursorStatus("Cursor Agent - ⏳ Working ···", CURSOR_APPROVAL_FRAME),
      "blocked",
    );
  });

  it("reads the sandboxed approval prompt as blocked", () => {
    assert.equal(
      cursorStatus(
        "Cursor Agent - ⏳ Working ···",
        CURSOR_APPROVAL_FRAME.replace(
          "Run this command?",
          "Run this command outside the sandbox?",
        ),
      ),
      "blocked",
    );
  });

  it("does not read agent prose about a command as blocked", () => {
    assert.equal(
      cursorStatus(
        "Cursor Agent - ⏳ Working ···",
        "You can run this command to verify the fix.",
      ),
      "working",
    );
  });

  it("does not read agent prose about the sandbox as blocked", () => {
    assert.equal(
      cursorStatus(
        "Cursor Agent - ⏳ Working ···",
        "You will need to run this command outside the sandbox.",
      ),
      "working",
    );
  });

  for (const dots of ["···", ".··", "..·", "..."]) {
    it(`reads a working title with ${dots} as working`, () => {
      assert.equal(
        cursorStatus(`Cursor Agent - ⏳ Working ${dots}`),
        "working",
      );
    });
  }

  it("reads a ready title as idle", () => {
    assert.equal(cursorStatus("Cursor Agent - ✅ Ready"), "idle");
  });

  it("has no braille title rule left", () => {
    assert.doesNotMatch(readFileSync(CURSOR_TOML, "utf-8"), /u2800/i);
    assert.equal(isActiveAgentTitle("⠋ Cursor Agent"), false);
    assert.equal(isActiveAgentTitle("Cursor Agent - ⏳ Working ···"), true);
  });
});
