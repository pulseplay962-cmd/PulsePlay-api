import express from "express";
import { createClient } from "@supabase/supabase-js";
import {
    generateAndSaveWeeklyContent,
    generateQueueImage,
    generateArticle
} from "../services/ai/contentService.js";

import {
    publishAIContent
} from "../services/ai/publisherService.js";


const router = express.Router();


// =====================================
// Supabase
// =====================================

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);


// =====================================
// Load AI Services
// =====================================


// =====================================
// PulseAI Content Generator
// =====================================


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
// Development Generator
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


export default router;