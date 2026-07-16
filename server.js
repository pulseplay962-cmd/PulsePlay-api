import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import twitchRouter from "./routes/twitch.js";

dotenv.config();

const app = express();

app.use(cors({
  origin: [
    "http://localhost:5173",
    "https://pulseplay-v2.onrender.com",
    "https://pulseplay.online",
    "https://www.pulseplay.online"
  ],
  credentials: true
}));

app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "PulsePlay API is running 🚀"
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok"
  });
});

app.use("/api/twitch", twitchRouter);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`PulsePlay API running on port ${PORT}`);
});
