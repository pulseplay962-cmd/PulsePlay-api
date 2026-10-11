const TOOL_ARGUMENTS = Object.freeze({
  get_pulseplay_system_status: [],
  list_jarvis_memories: ["limit"],
  list_pending_approvals: []
});

export function parseReadOnlyToolArguments(name, rawArguments) {
  if (!Object.prototype.hasOwnProperty.call(TOOL_ARGUMENTS, name)) {
    throw new Error("Tool is not allowlisted: " + String(name));
  }

  let args = {};
  if (rawArguments !== undefined && rawArguments !== null && rawArguments !== "") {
    try {
      args = JSON.parse(rawArguments);
    } catch {
      throw new Error("Tool arguments were not valid JSON.");
    }
  }

  if (!args || typeof args !== "object" || Array.isArray(args)) {
    throw new Error("Tool arguments must be a JSON object.");
  }

  const allowedKeys = TOOL_ARGUMENTS[name];
  for (const key of Object.keys(args)) {
    if (!allowedKeys.includes(key)) {
      throw new Error("Unsupported argument for " + name + ": " + key);
    }
  }

  if (name === "list_jarvis_memories" && args.limit !== undefined) {
    if (!Number.isInteger(args.limit)) {
      throw new Error("The memory limit must be an integer.");
    }
    args.limit = Math.max(1, Math.min(20, args.limit));
  }

  return args;
}
