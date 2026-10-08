import express from "express";
import { createClient } from "@supabase/supabase-js";
import {
  chat,
  createSession,
  getApprovals,
  getMemory,
  getSystemSnapshot,
  remember,
  requestApproval,
  resolveApproval
} from "../services/jarvisCore.js";

const router = express.Router();
const supabaseAuth = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function requireSupabaseUser(req, res, next) {
  try {
    const authorization = req.get("authorization") || "";
    const token = authorization.replace(/^Bearer\\s+/i, "").trim();

    if (!token) {
      return res.status(401).json({ success: false, error: "Authentication required." });
    }

    const { data, error } = await supabaseAuth.auth.getUser(token);

    if (error || !data?.user) {
      return res.status(401).json({ success: false, error: "Invalid or expired session." });
    }

    req.jarvisUser = data.user;
    next();
  } catch (error) {
    next(error);
  }
}

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

router.get("/ui/health", requireSupabaseUser, async (req, res, next) => {
  try {
    res.json({ success: true, ...(await getSystemSnapshot()) });
  } catch (error) {
    next(error);
  }
});

router.get("/ui/approvals", requireSupabaseUser, async (req, res, next) => {
  try {
    res.json({
      success: true,
      approvals: await getApprovals(req.query.status || null, req.query.limit)
    });
  } catch (error) {
    next(error);
  }
});

router.post("/ui/approvals", requireSupabaseUser, async (req, res, next) => {
  try {
    if (!req.body?.action) {
      return res.status(400).json({ success: false, error: "action is required." });
    }

    const approval = await requestApproval({
      action: req.body.action,
      payload: req.body.payload || {},
      sessionId: req.body.sessionId || null
    });

    res.status(201).json({ success: true, approval });
  } catch (error) {
    next(error);
  }
});

router.post("/ui/approvals/:id/resolve", requireSupabaseUser, async (req, res, next) => {
  try {
    const approval = await resolveApproval(
      req.params.id,
      req.body?.status,
      req.body?.sessionId || null
    );

    res.json({ success: true, approval });
  } catch (error) {
    next(error);
  }
});

router.get("/ui/memory", requireSupabaseUser, async (req, res, next) => {
  try {
    res.json({ success: true, memory: await getMemory(req.query.limit) });
  } catch (error) {
    next(error);
  }
});

router.post("/ui/memory", requireSupabaseUser, async (req, res, next) => {
  try {
    if (!req.body?.content) {
      return res.status(400).json({ success: false, error: "content is required." });
    }

    const memory = await remember({
      content: req.body.content,
      memoryType: req.body.memoryType || "fact",
      importance: req.body.importance || 5,
      source: "command-center"
    });

    res.status(201).json({ success: true, memory });
  } catch (error) {
    next(error);
  }
});

router.post("/ui/chat", requireSupabaseUser, async (req, res, next) => {
  try {
    if (!req.body?.message) {
      return res.status(400).json({ success: false, error: "message is required." });
    }

    let sessionId = req.body.sessionId || null;
    if (!sessionId) {
      const session = await createSession("JARVIS Command Center");
      sessionId = session.id;
    }

    const result = await chat({
      message: req.body.message,
      history: Array.isArray(req.body.history) ? req.body.history : [],
      sessionId
    });

    res.json({ success: true, sessionId, ...result });
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
