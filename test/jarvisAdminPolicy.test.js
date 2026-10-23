import test from "node:test";
import assert from "node:assert/strict";
import { isAuthorizedJarvisAdmin } from "../services/jarvisAdminPolicy.js";

test("denies missing or unprivileged users by default", () => {
  assert.equal(isAuthorizedJarvisAdmin(null, {}), false);
  assert.equal(isAuthorizedJarvisAdmin({ id: "user-1", email: "user@example.com" }, {}), false);
});

test("accepts an explicit admin role in app metadata", () => {
  assert.equal(isAuthorizedJarvisAdmin({ id: "user-1", app_metadata: { role: "admin" } }, {}), true);
  assert.equal(isAuthorizedJarvisAdmin({ id: "user-2", app_metadata: { roles: ["admin"] } }, {}), true);
});

test("accepts exact user ID allowlist entries", () => {
  assert.equal(isAuthorizedJarvisAdmin({ id: "user-2" }, { JARVIS_ADMIN_USER_IDS: "user-1, user-2" }), true);
  assert.equal(isAuthorizedJarvisAdmin({ id: "user-3" }, { JARVIS_ADMIN_USER_IDS: "user-1, user-2" }), false);
});

test("matches allowlisted emails case-insensitively", () => {
  assert.equal(isAuthorizedJarvisAdmin({ id: "user-1", email: "Admin@Example.com" }, { JARVIS_ADMIN_EMAILS: "admin@example.com" }), true);
  assert.equal(isAuthorizedJarvisAdmin({ id: "user-1", email: "other@example.com" }, { JARVIS_ADMIN_EMAILS: "admin@example.com" }), false);
});
