import express from "express";
import { getStreamStatus } from "../services/twitch.js";

const router = express.Router();

router.get("/status", async (req, res) => {
  try {
    const channel = req.query.channel || "Veiltactician";

    const stream = await getStreamStatus(channel);

    res.json({
      live: !!stream,
      stream
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to fetch Twitch status"
    });
  }
});

export default router;
