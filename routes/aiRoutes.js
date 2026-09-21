import express from "express";
import { createClient } from "@supabase/supabase-js";
import {
    generateAndSaveWeeklyContent,
    generateQueueImage,
    generateArticle
} from "../services/ai/contentService.js";

import {
    generateImage
} from "../services/ai/imageService.js";

import {
    requireAdmin
} from "../middleware/adminAuth.js";

import {
    runGrowthManager
} from "../services/ai/growthManagerService.js";

import {
    publishAIContent
} from "../services/ai/publisherService.js";

import {
    scanGameReleases,
    generateGamePackage
} from "../services/ai/gameReleaseService.js";

import {
    publishGamePackage
} from "../services/ai/gamePublisherService.js";


const router = express.Router();


// =====================================
// Supabase
// =====================================

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);


// =====================================
// Get AI Queue
// =====================================

router.get(
    "/queue",
    async (req, res) => {

        try {

            const { data, error } =
                await supabase
                    .from("ai_content_queue")
                    .select("*")
                    .order(
                        "scheduled_date",
                        {
                            ascending: true
                        }
                    );

            if (error) {

                console.error(
                    "AI queue load error:",
                    error
                );

                return res.status(500).json({
                    success: false,
                    error:
                        error.message ||
                        "Unable to load AI queue."
                });

            }

            return res.json({
                success: true,
                queue: data || []
            });

        } catch (error) {

            console.error(
                "AI queue route error:",
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    error.message ||
                    "Unable to load AI queue."
            });

        }

    }
);


// =====================================
// Generate + Save Weekly Content
// =====================================

router.post(
    "/generate-weekly-save",
    async (req, res) => {

        try {

            const posts =
                await generateAndSaveWeeklyContent();

            return res.json({
                success: true,
                posts
            });

        } catch (error) {

            console.error(
                "AI generate weekly save error:",
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    error.message ||
                    "Unable to generate weekly AI content."
            });

        }

    }
);


// =====================================
// AI GAME RELEASE SCANNER
// =====================================
//
// POST:
// /api/ai/game-releases/scan
//
// Example body:
//
// {
//     "year": 2026,
//     "month": 9,
//     "limit": 10
// }
//
// This route ONLY scans and returns
// release candidates.
//
// It does NOT write to the games table.
//
// =====================================

router.post(
    "/game-releases/scan",
    async (req, res) => {

        try {

            const year =
                req.body?.year ||
                new Date().getUTCFullYear();

            const month =
                req.body?.month ||
                new Date().getUTCMonth() + 1;

            const limit =
                req.body?.limit ||
                10;


            console.log(
                "================================="
            );

            console.log(
                "PULSEPLAY AI GAME RELEASE SCAN"
            );

            console.log(
                "YEAR:",
                year
            );

            console.log(
                "MONTH:",
                month
            );

            console.log(
                "LIMIT:",
                limit
            );

            console.log(
                "================================="
            );


            const result =
                await scanGameReleases({
                    year,
                    month,
                    limit
                });


            return res.json({

                success: true,

                year:
                    result.year,

                month:
                    result.month,

                limit:
                    result.limit,

                releases:
                    result.releases

            });


        } catch (error) {

            console.error(
                "AI game release scan error:",
                error
            );


            return res.status(500).json({

                success: false,

                error:
                    error.message ||
                    "Unable to scan game releases."

            });

        }

    }
);


// =====================================
// GENERATE GAME PACKAGE
// =====================================
//
// POST:
// /api/ai/game-releases/generate
//
// This generates the complete PulsePlay
// game listing package but DOES NOT publish it.
//
// =====================================

router.post(
    "/game-releases/generate",
    async (req, res) => {

        try {

            const release =
                req.body?.release;

            if (!release?.title) {
                return res.status(400).json({
                    success: false,
                    error:
                        "Game release information is required."
                });
            }

            console.log(
                "================================="
            );

            console.log(
                "PULSEPLAY AI GAME PACKAGE GENERATION"
            );

            console.log(
                "GAME:",
                release.title
            );

            console.log(
                "RELEASE DATE:",
                release.release_date
            );

            console.log(
                "================================="
            );

            const packageData =
                await generateGamePackage(release);

            return res.json({
                success: true,
                package: packageData
            });

        } catch (error) {

            console.error(
                "AI game package generation error:",
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    error.message ||
                    "Unable to generate game package."
            });

        }

    }
);



// =====================================
// PUBLISH GAME PACKAGE
// =====================================
//
// POST:
// /api/ai/game-releases/publish
//
// Publishes an approved game package to
// the games table and queues Facebook.
//
// Facebook is NOT posted immediately.
//
// =====================================

router.post(
    "/game-releases/publish",
    requireAdmin,
    async (req, res) => {

        try {

            const {
                package: packageData,
                selectedYear,
                selectedMonth,
                maxGames
            } = req.body || {};

            if (!packageData?.title) {

                return res.status(400).json({
                    success: false,
                    error:
                        "Game package is required."
                });

            }

            console.log(
                "================================="
            );

            console.log(
                "PULSEPLAY AI GAME PUBLISH"
            );

            console.log(
                "GAME:",
                packageData.title
            );

            console.log(
                "RELEASE DATE:",
                packageData.release_date
            );

            console.log(
                "SELECTED MONTH:",
                `${selectedYear}-${selectedMonth}`
            );

            console.log(
                "================================="
            );

            const result =
                await publishGamePackage({
                    packageData,
                    selectedYear,
                    selectedMonth,
                    maxGames:
                        maxGames ?? 10
                });

            return res.json({
                success: true,
                ...result
            });

        } catch (error) {

            console.error(
                "AI game package publish error:",
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    error.message ||
                    "Unable to publish game package."
            });

        }

    }
);


// =====================================
// Generate AI Image For Queue Item
// =====================================

router.post(
    "/image/:id",
    async (req, res) => {

        try {

            const { id } =
                req.params;

            if (!id) {

                return res.status(400).json({
                    success: false,
                    error:
                        "Queue item ID is required."
                });

            }

            const {
                data: item,
                error: fetchError
            } =
                await supabase
                    .from("ai_content_queue")
                    .select("*")
                    .eq("id", id)
                    .single();

            if (fetchError || !item) {

                console.error(
                    "AI queue item load error:",
                    fetchError
                );

                return res.status(404).json({
                    success: false,
                    error:
                        "Queue item not found."
                });

            }

            const updatedItem =
                await generateQueueImage(item);

            return res.json({
                success: true,
                item: updatedItem
            });

        } catch (error) {

            console.error(
                "AI image route error:",
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    error.message ||
                    "Unable to generate AI image."
            });

        }

    }
);


// =====================================
// Publish AI Content
// =====================================

router.post(
    "/publish/:id",
    async (req, res) => {

        try {

            const { id } =
                req.params;

            if (!id) {

                return res.status(400).json({
                    success: false,
                    error:
                        "Queue item ID is required."
                });

            }

            const {
                data: item,
                error: fetchError
            } =
                await supabase
                    .from("ai_content_queue")
                    .select("*")
                    .eq("id", id)
                    .single();

            if (fetchError || !item) {

                console.error(
                    "AI publish queue item error:",
                    fetchError
                );

                return res.status(404).json({
                    success: false,
                    error:
                        "Queue item not found."
                });

            }

            if (
                item.status !==
                "approved"
            ) {

                return res.status(400).json({
                    success: false,
                    error:
                        "Only approved content can be published."
                });

            }

            const result =
                await publishAIContent(item);

            return res.json({
                success: true,
                article:
                    result.article
            });

        } catch (error) {

            console.error(
                "AI publish route error:",
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    error.message ||
                    "Unable to publish AI content."
            });

        }

    }
);


// =====================================
// Debug AI Routes
// =====================================

router.get(
    "/_debug/routes",
    (req, res) => {

        const routes =
            router.stack
                .filter(
                    (layer) =>
                        layer.route
                )
                .map(
                    (layer) => ({
                        path:
                            layer.route.path,

                        methods:
                            layer.route.methods
                    })
                );

        return res.json({
            success: true,
            routes
        });

    }
);


// =====================================
// REAL OPENAI SINGLE IMAGE TEST
// =====================================

router.post(
    "/test-image",
    requireAdmin,
    async (req, res) => {

        try {

            const prompt =
                req.body?.prompt ||
                "A cinematic futuristic gaming setup with dark neon purple and cyan lighting, premium editorial gaming aesthetic, no logos, no text.";

            console.log(
                "================================="
            );

            console.log(
                "PULSEAI REAL OPENAI IMAGE TEST"
            );

            console.log(
                "PROMPT:",
                prompt
            );

            console.log(
                "================================="
            );

            const imageUrl =
                await generateImage(
                    prompt
                );

            return res.json({

                success: true,

                development: false,

                mode: "openai",

                imageUrl

            });

        } catch (error) {

            console.error(
                "PULSEAI IMAGE TEST ERROR:",
                error
            );

            return res.status(500).json({

                success: false,

                error:
                    error.message ||
                    "AI image generation failed."

            });

        }

    }
);


// =====================================
// REAL OPENAI SINGLE ARTICLE TEST
// =====================================

router.post(
    "/test-article",
    async (req, res) => {

        try {

            const topic =
                req.body?.topic ||
                "The latest developments in the gaming industry";

            console.log(
                "================================="
            );

            console.log(
                "PULSEAI REAL OPENAI TEST"
            );

            console.log(
                "TOPIC:",
                topic
            );

            console.log(
                "================================="
            );

            const article =
                await generateArticle(
                    topic
                );

            return res.json({

                success: true,

                development: false,

                mode: "openai",

                article

            });

        } catch (error) {

            console.error(
                "PULSEAI REAL TEST ERROR:",
                error
            );

            return res.status(500).json({

                success: false,

                error:
                    error.message ||
                    "AI test generation failed."

            });

        }

    }
);


// =====================================
// DEVELOPMENT GENERATE ROUTE
// =====================================

router.post(
    "/generate",
    async (req, res) => {

        try {

            const {
                title,
                type,
                prompt
            } = req.body;

            console.log(
                "================================"
            );

            console.log(
                "PulseAI REQUEST"
            );

            console.log(
                "MODE: DEVELOPMENT"
            );

            console.log(
                "Title:",
                title
            );

            console.log(
                "Type:",
                type
            );

            console.log(
                "================================"
            );

            if (
                !title ||
                !type
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Title and type are required."

                });

            }

            const content = `

# ${title}

## ${type}

Welcome to PulsePlay's gaming content network.

## Overview

${title} is generating discussion throughout the gaming community.

This PulsePlay article explores the latest information, player reactions, important details, and everything gamers should know.

## Gaming Community Reaction

Players continue to share opinions, strategies, and experiences surrounding ${title}.

The gaming community is always looking forward to updates, announcements, and new ways to enjoy their favorite games.

## PulsePlay Analysis

Our team takes a closer look at what this means for gamers and what players should watch for next.

PulsePlay delivers gaming news, reviews, guides, streams, and community discussions.

## Final Thoughts

Stay connected with PulsePlay for more gaming content, community updates, and future coverage.

${prompt || ""}

---

Generated By:

PulseAI Development Mode

Status:

Draft Content Preview

#PulsePlay #Gaming

            `;

            return res.json({

                success: true,

                development: true,

                mode: "development",

                content

            });

        } catch (error) {

            console.error(
                "PulseAI Development Error:",
                error
            );

            return res.status(500).json({

                success: false,

                error:
                    "Development content generation failed."

            });

        }

    }
);



// =====================================
// PULSEPLAY AI VISITOR ASSISTANT
// =====================================

import { answerPulsePlayQuestion } from "../services/ai/assistantService.js";

const assistantRateLimit = new Map();

router.post(
    "/assistant",
    async (req, res) => {
        try {
            const question = String(req.body?.question || "").trim();

            if (!question) {
                return res.status(400).json({
                    success: false,
                    error: "A question is required."
                });
            }

            if (question.length > 800) {
                return res.status(400).json({
                    success: false,
                    error: "Please keep your question under 800 characters."
                });
            }

            const key = req.ip || req.headers["x-forwarded-for"] || "unknown";
            const now = Date.now();
            const recent = assistantRateLimit.get(key) || [];
            const active = recent.filter((timestamp) => now - timestamp < 60_000);

            if (active.length >= 12) {
                return res.status(429).json({
                    success: false,
                    error: "PulsePlay AI is getting a lot of traffic. Please try again in a moment."
                });
            }

            active.push(now);
            assistantRateLimit.set(key, active);

            const result = await answerPulsePlayQuestion(question);

            return res.json({
                success: true,
                answer: result.answer,
                mode: result.mode,
                recommendations: result.recommendations || []
            });
        } catch (error) {
            console.error("PulsePlay AI assistant error:", error);

            return res.status(500).json({
                success: false,
                error: "PulsePlay AI is temporarily unavailable. Please try again shortly."
            });
        }
    }
);



router.post(
    "/growth/run",
    requireAdmin,
    async (req, res) => {
        try {
            const result = await runGrowthManager();
            return res.json(result);
        } catch (error) {
            console.error("AI Growth Manager error:", error);
            return res.status(500).json({
                success: false,
                error: error.message || "Unable to run the AI Growth Manager."
            });
        }
    }
);

export default router;
