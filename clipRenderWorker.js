import dotenv from "dotenv";
dotenv.config();

import express from "express";
import { createClient } from "@supabase/supabase-js";
import { renderClip, renderVerticalClip } from "./services/ai/streamClipService.js";

const app = express();
const PORT = process.env.PORT || 10000;
const WORKER_SECRET = process.env.CLIP_RENDER_WORKER_SECRET || "";
const SUPABASE_URL = process.env.SUPABASE_URL?.trim();
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();

if (!SUPABASE_URL) throw new Error("Missing SUPABASE_URL");
if (!SUPABASE_PUBLISHABLE_KEY) throw new Error("Missing SUPABASE_PUBLISHABLE_KEY");
if (!WORKER_SECRET) throw new Error("Missing CLIP_RENDER_WORKER_SECRET");

app.use(express.json({ limit: "64kb" }));

const queue = [];
let processing = false;

function authorized(req) {
  return req.headers["x-clip-worker-secret"] === WORKER_SECRET;
}

function workerClient() {
  return createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

async function processQueue() {
  if (processing) return;
  processing = true;

  while (queue.length) {
    const job = queue.shift();

    try {
      console.log("AI clip worker starting:", { clipId: job.clipId, queued: queue.length });
      const db = workerClient();
      if (job.mode === "vertical") await renderVerticalClip(job.clipId, db);
      else await renderClip(job.clipId, db);
      console.log("AI clip worker completed:", { clipId: job.clipId });
    } catch (error) {
      console.error("AI clip worker failed:", {
        clipId: job.clipId,
        error: error?.message || "Unknown render error",
      });
    }
  }

  processing = false;
}

app.get("/", (req, res) => {
  res.json({
    success: true,
    service: "PulsePlay AI Clip Render Worker",
    processing,
    queued: queue.length,
  });
});

app.get("/health", (req, res) => {
  res.json({ success: true, status: "ok", processing, queued: queue.length });
});

app.post("/render-vertical", (req, res) => {
  if (!authorized(req)) return res.status(401).json({ success: false, error: "Unauthorized render worker request." });
  const clipId = String(req.body?.clipId || "").trim();
  if (!clipId) return res.status(400).json({ success: false, error: "clipId is required." });
  if (queue.some((job) => job.clipId === clipId && job.mode === "vertical")) return res.status(202).json({ success: true, queued: true, duplicate: true, message: "Vertical clip is already queued.", queueLength: queue.length });
  queue.push({ clipId, mode: "vertical" });
  void processQueue();
  return res.status(202).json({ success: true, queued: true, mode: "vertical", message: "Vertical clip queued for background rendering.", queueLength: queue.length });
});

app.post("/render", (req, res) => {
  if (!authorized(req)) {
    return res.status(401).json({ success: false, error: "Unauthorized render worker request." });
  }

  const clipId = String(req.body?.clipId || "").trim();

  if (!clipId) {
    return res.status(400).json({
      success: false,
      error: "clipId is required.",
    });
  }

  if (queue.some((job) => job.clipId === clipId)) {
    return res.status(202).json({
      success: true,
      queued: true,
      duplicate: true,
      message: "Clip is already queued for rendering.",
      queueLength: queue.length,
    });
  }

  queue.push({ clipId });
  void processQueue();

  return res.status(202).json({
    success: true,
    queued: true,
    message: "Clip queued for background rendering.",
    queueLength: queue.length,
  });
});

app.listen(PORT, () => {
  console.log("PulsePlay AI Clip Render Worker running on port " + PORT);
});
