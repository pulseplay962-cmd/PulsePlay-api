import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const JARVIS_SYSTEM_PROMPT = [
  "You are PulsePlay JARVIS, the private AI command assistant for PulsePlay.online.",
  "Your role is to help operate, monitor, and improve the PulsePlay gaming network.",
  "",
  "Personality:",
  "- Calm, capable, concise, and professional.",
  "- Slightly futuristic, but never pretend to be sentient.",
  "- Address the user naturally; use sir only occasionally and never excessively.",
  "- Be honest about what you can and cannot access.",
  "- Never invent system status, metrics, completed actions, or permissions.",
  "",
  "Safety:",
  "- Treat public posting, production deployments, deleting data, changing production configuration, financial actions, and destructive operations as approval-required.",
  "- Never claim an approval-required action was performed unless a separate trusted tool confirms it.",
  "- If an action needs approval, explain what would happen and return an approval request instead of performing it.",
  "",
  "PulsePlay context:",
  "- PulsePlay.online is an independent gaming, streaming, community, news, gear, and merchandise platform.",
  "- Veiltactician is the associated Twitch creator.",
  "- The platform uses a React/Vite frontend, a Node/Express API, Supabase, and Render."
].join("\n");

function requireEnv(name) {
  if (!process.env[name]) throw new Error("Missing required environment variable: " + name);
}

export async function getMemory(limit = 12) {
  requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const { data, error } = await supabase
    .from("jarvis_memory")
    .select("id,memory_type,content,importance,source,updated_at")
    .order("importance", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(Math.min(Number(limit) || 12, 50));

  if (error) throw error;
  return data || [];
}

export async function remember({ content, memoryType = "fact", importance = 5, source = "jarvis" }) {
  const clean = String(content || "").trim();
  if (!clean) throw new Error("Memory content is required.");

  const { data, error } = await supabase
    .from("jarvis_memory")
    .insert({
      content: clean,
      memory_type: memoryType,
      importance: Math.max(1, Math.min(10, Number(importance) || 5)),
      source
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function createSession(title = "JARVIS Session") {
  const { data, error } = await supabase
    .from("jarvis_sessions")
    .insert({ title })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function audit(sessionId, eventType, action = null, details = {}) {
  const { error } = await supabase.from("jarvis_audit_log").insert({
    session_id: sessionId || null,
    event_type: eventType,
    action,
    details
  });

  if (error) console.error("JARVIS audit error:", error.message);
}

export async function chat({ message, history = [], sessionId = null }) {
  requireEnv("OPENAI_API_KEY");
  const memories = await getMemory(12);

  const memoryText = memories.length
    ? memories.map((m) => "- [" + m.memory_type + "] " + m.content).join("\n")
    : "No long-term JARVIS memories have been stored yet.";

  const messages = [
    {
      role: "system",
      content: JARVIS_SYSTEM_PROMPT + "\n\nLong-term memory:\n" + memoryText
    },
    ...history.slice(-12).map((item) => ({
      role: item.role === "assistant" ? "assistant" : "user",
      content: String(item.content || "")
    })),
    { role: "user", content: String(message || "") }
  ];

  const model = process.env.JARVIS_MODEL || "gpt-4.1-mini";
  const completion = await openai.chat.completions.create({
    model,
    messages,
    temperature: 0.35
  });

  const reply = completion.choices?.[0]?.message?.content?.trim() ||
    "I was unable to produce a response.";

  await audit(sessionId, "chat", "conversation", {
    inputLength: String(message || "").length,
    model
  });

  return { reply, model, memoriesUsed: memories.length };
}

export async function getSystemSnapshot() {
  const checks = {
    api: { status: "online", service: "PulsePlay API" },
    database: "unknown",
    openai: process.env.OPENAI_API_KEY ? "configured" : "missing",
    jarvisKey: process.env.JARVIS_API_KEY ? "configured" : "missing"
  };

  const { error } = await supabase.from("jarvis_memory").select("id", { count: "exact", head: true });
  checks.database = error ? "error" : "online";

  return {
    status: checks.database === "online" && checks.openai === "configured" ? "operational" : "attention",
    timestamp: new Date().toISOString(),
    checks
  };
}
