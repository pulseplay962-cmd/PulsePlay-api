import dotenv from "dotenv";
dotenv.config();

import express from "express";
import { createClient } from "@supabase/supabase-js";
import { createSocialPost } from "../services/socialQueue.js";
import { publishToFacebook } from "../services/facebookService.js";

console.log("🔥 NEWS ROUTES FILE LOADED");

const router = express.Router();

router.get(
    "/test",
    (req, res) => {
        console.log("🔥 NEWS TEST ROUTE HIT");

        res.json({
            success: true,
            message: "News route is working"
        });
    }
);

// TEMPORARY CONTROLLED FACEBOOK TEST
router.get(
    "/facebook-test",
    async (req, res) => {
        try {
            const result = await publishToFacebook({
                message:
                    "⚡ PulsePlay Facebook Auto-Posting Test\n\n" +
                    "The Gaming Command Center is now connected. " +
                    "Automatic PulsePlay article posting to Facebook is being tested.\n\n" +
                    "PulsePlay.online — Gaming • Streaming • Community",
                link: "https://pulseplay.online/"
            });

            return res.json({
                success: true,
                message: "Facebook test post published.",
                postId: result.postId || null
            });
        } catch (error) {
            console.error(
                "Facebook test publish error:",
                error
            );

            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
);

console.log(
    "NEWS ROUTE ENV CHECK:",
    process.env.SUPABASE_URL
);

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ==================================
// Publish Article From PulseAI
// ==================================

router.post(
    "/publish",
    async (req, res) => {
        try {
            const {
                title,
                slug,
                excerpt,
                content,
                image,
                category,
                author
            } = req.body;

            if (!title || !content) {
                return res.status(400).json({
                    success: false,
                    error: "Title and content are required."
                });
            }

            const { data, error } = await supabase
                .from("news")
                .insert([
                    {
                        title,
                        slug,
                        excerpt,
                        content,
                        image: image || "",
                        category: category || "Gaming",
                        author: author || "PulseAI",
                        published: true,
                        status: "published"
                    }
                ])
                .select()
                .single();

            if (error) {
                console.error(
                    "Publish insert error:",
                    error
                );

                return res.status(500).json({
                    success: false,
                    error: error.message
                });
            }

            try {
                const socialText = [
                    title,
                    excerpt || "",
                    `Read more: https://pulseplay.online/news/${data.slug}`
                ]
                    .filter(Boolean)
                    .join("\n\n");

                await createSocialPost({
                    newsId: data.id,
                    platform: "facebook",
                    postText: socialText,
                    imageUrl: image || "",
                    hashtags: [],
                    scheduledAt: null
                });
            } catch (socialError) {
                console.error(
                    "Facebook social post creation failed:",
                    socialError
                );
            }

            return res.json({
                success: true,
                article: data
            });
        } catch (error) {
            console.error(
                "Publish route error:",
                error
            );

            return res.status(500).json({
                success: false,
                error: "Unable to publish article."
            });
        }
    }
);

console.log(
    "NEWS ROUTER READY"
);

export default router;
