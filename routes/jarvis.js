import express from "express";
import { chat, createSession, getMemory, getSystemSnapshot, remember } from "../services/jarvisCore.js";

const router = express.Router();

function requireJarvisKey(req, res, next) {
  const expected = process.env.JARVIS_API_KEY;
  const provided = req.get("x-jarvis-key") || req.get("authorization")?.replace(/^Bearer\\s+/i, "");

  if (!expected) {
    return res.status(503).json({ success: false, error: "JARVIS_API_KEY is not configured." });
  }

  if (!provided || provided !== expected) {
    return res.status(401).json({ success: false, error: "Unauthorized." });
  }

  next();
}

router.get("/health", requireJarvisKey, async (req, res, next) => {
  try {
    res.json({ success: true, ...await getSystemSnapshot() });
  } catch (error) {
    next(error);
  }
});

router.get("/memory", requireJarvisKey, async (req, res, next) => {
  try {
    res.json({ success: true, memory: await getMemory(req.query.limit) });
  } catch (error) {
    next(error);
  }
});

router.post("/memory", requireJarvisKey, async (req, res, next) => {
  try {
    const memory = await remember(req.body || {});
    res.status(201).json({ success: true, memory });
  } catch (error) {
    next(error);
  }
});

router.post("/sessions", requireJarvisKey, async (req, res, next) => {
  try {
    const session = await createSession(req.body?.title || "JARVIS Session");
    res.status(201).json({ success: true, session });
  } catch (error) {
    next(error);
  }
});

router.post("/chat", requireJarvisKey, async (req, res, next) => {
  try {
    if (!req.body?.message) {
      return res.status(400).json({ success: false, error: "message is required." });
    }

    const result = await chat({
      message: req.body.message,
      history: Array.isArray(req.body.history) ? req.body.history : [],
      sessionId: req.body.sessionId || null
    });

    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
});

export default router;
