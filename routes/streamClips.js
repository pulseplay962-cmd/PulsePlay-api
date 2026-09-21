import express from "express";
import { requireAdmin } from "../middleware/adminAuth.js";
import { syncRecentStreamVods, listStreamVods, createClipCandidate, renderClip, listClips, analyzeVodForClipCandidates } from "../services/ai/streamClipService.js";

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
