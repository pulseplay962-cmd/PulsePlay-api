import test from "node:test";
import assert from "node:assert/strict";
import { parseReadOnlyToolArguments } from "../services/jarvisToolPolicy.js";

test("accepts known tools with no arguments", () => {
  assert.deepEqual(parseReadOnlyToolArguments("get_pulseplay_system_status", "{}"), {});
  assert.deepEqual(parseReadOnlyToolArguments("list_pending_approvals", ""), {});
});

test("accepts and bounds the memory limit", () => {
  assert.deepEqual(parseReadOnlyToolArguments("list_jarvis_memories", '{"limit":8}'), { limit: 8 });
  assert.deepEqual(parseReadOnlyToolArguments("list_jarvis_memories", '{"limit":99}'), { limit: 20 });
  assert.deepEqual(parseReadOnlyToolArguments("list_jarvis_memories", '{"limit":0}'), { limit: 1 });
});

test("rejects unknown tool names", () => {
  assert.throws(() => parseReadOnlyToolArguments("run_shell_command", "{}"), /not allowlisted/);
});

test("rejects malformed or non-object JSON arguments", () => {
  assert.throws(() => parseReadOnlyToolArguments("list_jarvis_memories", "{"), /valid JSON/);
  assert.throws(() => parseReadOnlyToolArguments("list_jarvis_memories", "[]"), /JSON object/);
  assert.throws(() => parseReadOnlyToolArguments("list_jarvis_memories", "null"), /JSON object/);
});

test("rejects unexpected parameters and non-integer limits", () => {
  assert.throws(() => parseReadOnlyToolArguments("get_pulseplay_system_status", '{"url":"https://example.com"}'), /Unsupported argument/);
  assert.throws(() => parseReadOnlyToolArguments("list_jarvis_memories", '{"limit":2.5}'), /integer/);
});
