import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { isActiveAgentTitle } from "./agent-title.js";
import { parseManifestFile } from "./loader.js";
import { observeWithManifest } from "./observe.js";

const CURSOR_TOML = "src/adapters/manifests/cursor.toml";

function statusFrom(toml: string, paneTitle: string, bottomLines: string) {
  const manifest = parseManifestFile(toml);
  assert.ok(manifest);
  return observeWithManifest({ paneTitle, bottomLines }, manifest)?.status;
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
