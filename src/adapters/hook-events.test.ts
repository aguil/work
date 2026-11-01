import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapHookEventToStatus } from "./hook-events.js";

function mapNotification(notification_type?: string) {
  return mapHookEventToStatus("Notification", {
    hook_event_name: "Notification",
    message: "Claude needs your attention",
    notification_type,
  });
}

describe("mapHookEventToStatus: Notification", () => {
  for (const type of [
    "permission_prompt",
    "elicitation_dialog",
    "elicitation_url_dialog",
    "quota_auto_resume_stale",
  ]) {
    it(`maps ${type} to blocked`, () => {
      assert.equal(mapNotification(type), "blocked");
    });
  }

  it("maps idle_prompt to idle", () => {
    assert.equal(mapNotification("idle_prompt"), "idle");
  });

  for (const type of [
    "auth_success",
    "elicitation_complete",
    "elicitation_response",
    "agent_needs_input",
    "agent_completed",
    "quota_auto_resume_fired",
    "quota_auto_resume_disabled",
    "a_type_from_a_later_build",
  ]) {
    it(`maps ${type} to null`, () => {
      assert.equal(mapNotification(type), null);
    });
  }

  it("maps a payload with no notification_type to null", () => {
    assert.equal(mapNotification(), null);
  });
});

describe("mapHookEventToStatus: beforeSubmitPrompt", () => {
  it("maps Cursor's prompt hook to working", () => {
    assert.equal(mapHookEventToStatus("beforeSubmitPrompt", {}), "working");
  });
});
