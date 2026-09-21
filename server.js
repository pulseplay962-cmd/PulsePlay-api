import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";

import twitchRoutes from "./routes/twitch.js";
import aiRoutes from "./routes/aiRoutes.js";
import newsRoutes from "./routes/newsRoutes.js";
import printfulRoutes from "./routes/printful.js";
import checkoutRoutes from "./routes/checkout.js";
import stripeWebhookRoutes from "./routes/stripeWebhook.js";
import monetizationRoutes from "./routes/monetization.js";
import recommendationsRoutes from "./routes/recommendations.js";
import streamClipsRoutes from "./routes/streamClips.js";

const app = express();
const PORT = process.env.PORT || 5000;

const allowedOrigins = [
    "http://localhost:5173",
    "http://localhost:5174",
    "https://pulseplay-v2-f0wz.onrender.com",
    "https://pulseplay.online",
    "https://www.pulseplay.online"
];

const corsOptions = {
    origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error("CORS origin not allowed"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    optionsSuccessStatus: 204
};

app.use(cors(corsOptions));

app.use("/api/stripe", stripeWebhookRoutes);
console.log("Stripe webhook mounted at /api/stripe/webhook");

app.use(express.json());

app.get("/", (req, res) => {
    res.json({ success: true, message: "PulsePlay API is running 🚀" });
});

app.get("/api/health", (req, res) => {
    res.json({ status: "ok", service: "PulsePlay API" });
});

console.log("Loading Twitch routes...");
app.use("/api/twitch", twitchRoutes);

console.log("Loading AI routes...");
app.use("/api/ai", aiRoutes);
console.log("AI routes mounted at /api/ai");

console.log("Loading News routes...");
app.get("/api/news/direct-test", (req, res) => {
    res.json({ success: true, message: "Direct server news route works" });
});
app.use("/api/news", newsRoutes);

console.log("Loading monetization routes...");
app.use("/api/monetization", monetizationRoutes);
console.log("Monetization routes mounted at /api/monetization");

console.log("Loading affiliate recommendation routes...");
app.use("/api/recommendations", recommendationsRoutes);

app.use("/api/ai/stream-clips", streamClipsRoutes);

console.log("Affiliate recommendation routes mounted at /api/recommendations");
console.log("Printful routes mounted at /api/printful");

app.use("/api/printful", printfulRoutes);
app.use("/api/checkout", checkoutRoutes);

console.log("News routes mounted at /api/news");

app.use((err, req, res, next) => {
    console.error("Server Error:", err);

    if (err.message === "CORS origin not allowed") {
        return res.status(403).json({
            success: false,
            error: "CORS origin not allowed"
        });
    }

    res.status(500).json({
        success: false,
        error: err.message || "Internal server error"
    });
});

app.listen(PORT, () => {
    console.log("PulsePlay API running on port " + PORT);
});
