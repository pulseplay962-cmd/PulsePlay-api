import express from "express";
import { requireAdmin } from "../middleware/adminAuth.js";
import { syncRecentStreamVods, listStreamVods, publishStreamVod } from "../services/ai/streamClipService.js";

const router = express.Router();

router.get("/vods", requireAdmin, async (req,res)=>{
  try {
    const limit = Math.min(Number(req.query.limit)||20,50);
    if (String(req.query.sync||"false")==="true") {
      await syncRecentStreamVods(req.query.channel||undefined,limit);
    }
    res.json({success:true,vods:await listStreamVods(limit)});
  } catch(error) {
    console.error("AI stream VOD error:",error);
    res.status(500).json({success:false,error:error.message||"Unable to load stream VODs."});
  }
});

router.post("/vods/:id/load-to-site", requireAdmin, async (req,res)=>{
  try {
    const video = await publishStreamVod(req.params.id);
    res.json({success:true,video,message:"VOD loaded to the PulsePlay Videos page."});
  } catch(error) {
    console.error("Load VOD to site error:",error);
    res.status(500).json({success:false,error:error.message||"Unable to load VOD to the site."});
  }
});

export default router;
