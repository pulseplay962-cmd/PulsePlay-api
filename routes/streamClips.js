import express from "express";
import { requireAdmin } from "../middleware/adminAuth.js";
import {
  syncRecentStreamVods,
  listStreamVods,
  publishStreamVod,
  listClips,
  analyzeVodForClipCandidates,
  autoRenderTopClips,
  queueSingleClipRender,
  queueVerticalClipRender,
  queueCaptionedVerticalClipRender,
} from "../services/ai/streamClipService.js";

const router = express.Router();

function sendError(res, label, error, fallback) {
  console.error(label, error);
  return res.status(500).json({
    success: false,
    error: error?.message || fallback,
  });
}

router.get("/vods", requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
    if (String(req.query.sync || "false") === "true") {
      await syncRecentStreamVods(req.query.channel || undefined, limit);
    }
    res.json({ success: true, vods: await listStreamVods(limit) });
  } catch (error) {
    return sendError(res, "AI stream VOD error:", error, "Unable to load stream VODs.");
  }
});

router.post("/vods/:id/load-to-site", requireAdmin, async (req, res) => {
  try {
    const video = await publishStreamVod(req.params.id);
    res.json({ success: true, video, message: "VOD loaded to the PulsePlay Videos page." });
  } catch (error) {
    return sendError(res, "Load VOD to site error:", error, "Unable to load VOD to the site.");
  }
});

// Clip production routes are deliberately admin-triggered: analysis and rendering
// may use paid AI resources, and generated clips are not published automatically.
router.get("/clips", requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const vodId = typeof req.query.vodId === "string" && req.query.vodId.trim()
      ? req.query.vodId.trim()
      : null;
    res.json({ success: true, clips: await listClips(vodId, limit) });
  } catch (error) {
    return sendError(res, "AI stream clips list error:", error, "Unable to load clip candidates.");
  }
});

router.post("/vods/:id/analyze", requireAdmin, async (req, res) => {
  try {
    const result = await analyzeVodForClipCandidates(req.params.id);
    res.json({ success: true, ...result });
  } catch (error) {
    return sendError(res, "AI VOD analysis error:", error, "Unable to analyze this VOD.");
  }
});

router.post("/vods/:id/render-top", requireAdmin, async (req, res) => {
  try {
    const requestedLimit = Number(req.body?.limit) || 3;
    const result = await autoRenderTopClips(
      req.params.id,
      Math.min(Math.max(requestedLimit, 1), 3),
      req.headers.authorization || ""
    );
    res.json({ success: true, ...result });
  } catch (error) {
    return sendError(res, "AI clip render queue error:", error, "Unable to queue clip renders.");
  }
});

router.post("/clips/:id/render", requireAdmin, async (req, res) => {
  try {
    const result = await queueSingleClipRender(req.params.id, req.headers.authorization || "");
    res.status(202).json({ success: true, ...result });
  } catch (error) {
    return sendError(res, "AI single clip queue error:", error, "Unable to queue this clip render.");
  }
});

router.post("/clips/:id/render-vertical", requireAdmin, async (req, res) => {
  try {
    const result = await queueVerticalClipRender(req.params.id, req.headers.authorization || "");
    res.status(202).json({ success: true, ...result });
  } catch (error) {
    return sendError(res, "AI vertical clip queue error:", error, "Unable to queue vertical rendering.");
  }
});

router.post("/clips/:id/render-captioned-vertical", requireAdmin, async (req, res) => {
  try {
    const result = await queueCaptionedVerticalClipRender(req.params.id, req.headers.authorization || "");
    res.status(202).json({ success: true, ...result });
  } catch (error) {
    return sendError(res, "AI captioned clip queue error:", error, "Unable to queue captioned rendering.");
  }
});

export default router;
