import express from "express";
import { requireAdmin } from "../middleware/adminAuth.js";
import { syncRecentStreamVods, listStreamVods, createClipCandidate, renderClip, renderVerticalClip, queueVerticalClipRender, listClips, analyzeVodForClipCandidates, autoRenderTopClips } from "../services/ai/streamClipService.js";

const router = express.Router();

router.get("/vods", requireAdmin, async (req,res)=>{
  try {
    const limit = Math.min(Number(req.query.limit)||20,50);
    if (String(req.query.sync||"false")==="true") await syncRecentStreamVods(req.query.channel||undefined,limit);
    res.json({success:true,vods:await listStreamVods(limit)});
  } catch(error) {
    console.error("AI stream VOD error:",error);
    res.status(500).json({success:false,error:error.message||"Unable to load stream VODs."});
  }
});

router.post("/vods/:id/analyze", requireAdmin, async (req,res)=>{
  try {
    const result = await analyzeVodForClipCandidates(req.params.id);
    res.json({success:true,...result});
  } catch(error) {
    console.error("AI VOD analysis error:",error);
    res.status(500).json({success:false,error:error.message||"Unable to analyze VOD."});
  }
});

router.post("/vods/:id/auto-render", requireAdmin, async (req,res)=>{
  try {
    const limit = Math.min(Number(req.body?.limit) || 3, 3);
    res.status(202).json({
      success: true,
      started: true,
      message: `Auto-render started for up to ${limit} AI-ranked clips. Rendering continues in the background.`,
      limit
    });

    const authorization = req.headers.authorization || "";
    void autoRenderTopClips(req.params.id, limit, authorization).then((result) => {
      console.log("AI auto-render background complete:", {
        vodId: req.params.id,
        queued: result.queued?.length || 0,
        errors: result.errors?.length || 0
      });
    }).catch((error) => {
      console.error("AI auto-render background error:", error);
    });
  } catch(error) {
    console.error("AI auto-render start error:",error);
    if (!res.headersSent) {
      res.status(500).json({success:false,error:error.message||"Unable to start auto-render."});
    }
  }
});

router.post("/:id/render-vertical", requireAdmin, async (req,res)=>{
  try { const authorization = req.headers.authorization || "";
    const result = await queueVerticalClipRender(req.params.id, authorization);
    res.status(202).json({success:true,queued:true,...result}); }
  catch(error) { console.error("AI vertical clip render error:",error); res.status(500).json({success:false,error:error.message||"Unable to render vertical clip."}); }
});

router.get("/clips", requireAdmin, async (req,res)=>{
  try { res.json({success:true,clips:await listClips(req.query.vodId||null,Math.min(Number(req.query.limit)||50,100))}); }
  catch(error) { console.error("AI stream clips error:",error); res.status(500).json({success:false,error:error.message||"Unable to load clips."}); }
});

router.post("/candidates", requireAdmin, async (req,res)=>{
  try {
    const {vodId,startSeconds,endSeconds,momentType,context,score}=req.body||{};
    if (!vodId || startSeconds===undefined || endSeconds===undefined) return res.status(400).json({success:false,error:"vodId, startSeconds and endSeconds are required."});
    res.json({success:true,clip:await createClipCandidate({vodId,startSeconds,endSeconds,momentType,context,score})});
  } catch(error) { console.error("AI clip candidate error:",error); res.status(500).json({success:false,error:error.message||"Unable to create clip candidate."}); }
});

router.post("/:id/render", requireAdmin, async (req,res)=>{
  try { res.json({success:true,clip:await renderClip(req.params.id)}); }
  catch(error) { console.error("AI clip render error:",error); res.status(500).json({success:false,error:error.message||"Unable to render clip."}); }
});

export default router;
