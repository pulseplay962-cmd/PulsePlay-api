import dotenv from "dotenv";
dotenv.config();

import express from "express";
import { createClient } from "@supabase/supabase-js";
import { createSocialPost } from "../services/socialQueue.js";
import { researchGamingNews } from "../services/ai/researchService.js";
import { generateArticle } from "../services/ai/contentService.js";

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

console.log(
    "NEWS ROUTE ENV CHECK:",
    process.env.SUPABASE_URL
);

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ==================================
// Refresh AI Gaming News
// ==================================
//
// Researches current gaming RSS feeds,
// generates fresh PulsePlay news drafts,
// and saves them to the AI content queue.
//
// This does NOT publish automatically.
// ==================================

router.post(
    "/refresh-ai",
    async (req, res) => {
        try {
            console.log("=================================");
            console.log("PULSEPLAY AI NEWS REFRESH");
            console.log("=================================");

            const research = await researchGamingNews();

            if (!research.length) {
                return res.status(502).json({
                    success: false,
                    error: "No current gaming news was returned by the research sources."
                });
            }

            const { data: existingQueue, error: queueError } =
                await supabase
                    .from("ai_content_queue")
                    .select("title, source_url")
                    .order("created_at", { ascending: false })
                    .limit(250);

            if (queueError) {
                throw queueError;
            }

            const existingTitles = new Set(
                (existingQueue || [])
                    .map(item => String(item.title || "").toLowerCase().trim())
                    .filter(Boolean)
            );

            const existingSourceUrls = new Set(
                (existingQueue || [])
                    .map(item => String(item.source_url || "").trim())
                    .filter(Boolean)
            );

            const freshSources = research
                .filter(source => {
                    const title = String(source.title || "").toLowerCase().trim();
                    const sourceUrl = String(source.url || "").trim();

                    return (
                        title &&
                        !existingTitles.has(title) &&
                        sourceUrl &&
                        !existingSourceUrls.has(sourceUrl)
                    );
                })
                .slice(0, 12);

            if (!freshSources.length) {
                return res.json({
                    success: true,
                    created: 0,
                    message: "No new gaming news was found that is not already in the AI queue.",
                    posts: []
                });
            }

            const posts = [];

            for (const source of freshSources) {
                if (posts.length >= 3) {
                    break;
                }
                const topic = [
                    "Write a current PulsePlay gaming news article based ONLY on the verified research below.",
                    "Do not invent facts, dates, quotes, announcements, features, or statistics.",
                    "Clearly distinguish confirmed information from speculation.",
                    `Source: ${source.source || "Gaming news feed"}`,
                    `Published: ${source.published_at || "Unknown"}`,
                    `Headline: ${source.title}`,
                    `Summary: ${source.summary || "No summary provided."}`,
                    `Source URL: ${source.url}`
                ].join("\n\n");

                const article = await generateArticle(topic);

                if (!article?.title || !article?.body) {
                    console.warn(
                        "AI news article skipped because it was incomplete:",
                        source.title
                    );
                    continue;
                }

                const scheduledDate =
                    new Date().toISOString().split("T")[0];

                const { data: inserted, error: insertError } =
                    await supabase
                        .from("ai_content_queue")
                        .insert({
                            title: article.title,
                            content_type: "news",
                            category: "Gaming News & Updates",
                            body: article.body,
                            social_caption: article.social_caption || "",
                            image_prompt: article.image_prompt || "",
                            image_url: article.image_url || "",
                            source_url: source.url,
                            source_name: source.source || "",
                            research_source_index: research.indexOf(source),
                            status: "draft",
                            scheduled_date: scheduledDate
                        })
                        .select()
                        .single();

                if (insertError) {
                    console.error(
                        "AI news queue insert failed:",
                        insertError
                    );
                    continue;
                }

                posts.push(inserted);
            }

            return res.json({
                success: true,
                created: posts.length,
                researched: research.length,
                candidates: freshSources.length,
                message:
                    posts.length > 0
                        ? `Created ${posts.length} fresh gaming news draft(s).`
                        : "Fresh gaming sources were found, but the AI could not produce complete articles from the available candidates.",
                posts
            });

        } catch (error) {
            console.error(
                "AI news refresh error:",
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    error.message ||
                    "Unable to refresh AI gaming news."
            });
        }
    }
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
