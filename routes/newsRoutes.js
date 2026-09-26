import dotenv from "dotenv";
dotenv.config();

import express from "express";
import { createClient } from "@supabase/supabase-js";
import { createSocialPost } from "../services/socialQueue.js";
import { researchGamingNews } from "../services/ai/researchService.js";
import { generateArticle, generateQueueImage } from "../services/ai/contentService.js";

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

function normalizeNewsUrl(url = "") {
    try {
        const parsed = new URL(String(url).trim());
        const removable = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"];
        removable.forEach(key => parsed.searchParams.delete(key));
        parsed.hash = "";
        return parsed.toString().replace(/\/$/, "");
    } catch {
        return String(url || "").trim().replace(/\/$/, "");
    }
}

function normalizeNewsTitle(title = "") {
    return String(title)
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function isSimilarTitle(title, existingTitles) {
    const words = new Set(
        normalizeNewsTitle(title)
            .split(" ")
            .filter(word => word.length > 2)
    );

    if (words.size < 5) return false;

    for (const existing of existingTitles) {
        const existingWords = new Set(
            normalizeNewsTitle(existing)
                .split(" ")
                .filter(word => word.length > 2)
        );

        if (existingWords.size < 5) continue;

        let overlap = 0;

        for (const word of words) {
            if (existingWords.has(word)) overlap++;
        }

        const similarity =
            overlap / Math.max(words.size, existingWords.size);

        if (similarity >= 0.88) return true;
    }

    return false;
}

function isUsableGeneratedArticle(article) {
    const title = String(article?.title || "").trim();
    const body = String(article?.body || "").trim();

    if (title.length < 12 || body.length < 500) {
        return false;
    }

    const blockedPhrases = [
        "lorem ipsum",
        "insert article",
        "placeholder text",
        "as an ai",
        "i cannot verify"
    ];

    const lowerBody = body.toLowerCase();

    return !blockedPhrases.some(
        phrase => lowerBody.includes(phrase)
    );
}

async function withRetry(operation, label, attempts = 2) {
    let lastError;

    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;

            console.warn(
                "NEWS REFRESH " + label +
                " attempt " + attempt + "/" + attempts +
                " failed:",
                error?.message || error
            );

            if (attempt < attempts) {
                await new Promise(resolve =>
                    setTimeout(resolve, 1500)
                );
            }
        }
    }

    throw lastError;
}

// ==================================
// Refresh AI Gaming News
// ==================================
//
// Researches current gaming RSS feeds,
// generates fresh PulsePlay news drafts,
// and saves them to the AI content queue.
//
// This does NOT publish automatically.\n// Each fresh article also receives a stored AI-generated image so the weekly\n// refresh requires minimal manual work in AI Content Studio.
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
                    .limit(2000);

            if (queueError) {
                throw queueError;
            }

            const existingTitles = new Set(
                (existingQueue || [])
                    .map(item => String(item.title || "").trim())
                    .filter(Boolean)
            );

            const existingSourceUrls = new Set(
                (existingQueue || [])
                    .map(item => normalizeNewsUrl(item.source_url))
                    .filter(Boolean)
            );

            const freshSources = research
                .filter(source => {
                    const title = String(source.title || "").trim();
                    const sourceUrl = normalizeNewsUrl(source.url);

                    return (
                        title &&
                        !existingTitles.has(title) &&
                        !isSimilarTitle(title, existingTitles) &&
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
                if (posts.length >= 5) {
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

                let article;

                try {
                    article = await withRetry(
                        () => generateArticle(topic),
                        "article generation for " + source.title
                    );
                } catch (articleError) {
                    console.error(
                        "AI news article generation failed after retry:",
                        source.title,
                        articleError
                    );
                    continue;
                }

                // generateArticle() returns the single-article shape
                // (title, article, facebookPost, imagePrompt, hashtags).
                // Normalize it here to the queue shape (title, body,
                // social_caption, image_prompt) used by AI News Refresh.
                const normalizedArticle = {
                    title: article?.title || "",
                    body: article?.article || article?.body || "",
                    social_caption: article?.facebookPost || article?.social_caption || "",
                    image_prompt: article?.imagePrompt || article?.image_prompt || "",
                    hashtags: Array.isArray(article?.hashtags) ? article.hashtags : []
                };

                if (!isUsableGeneratedArticle(normalizedArticle)) {
                    console.warn(
                        "AI news article skipped by quality validation:",
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
                            body: normalizedArticle.body,
                            social_caption: normalizedArticle.social_caption,
                            image_prompt: normalizedArticle.image_prompt,
                            hashtags: normalizedArticle.hashtags,
                            image_url: article.image_url || "",
                            source_url: normalizeNewsUrl(source.url),
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

                let finalPost = inserted;\n\n                // Generate the editorial image automatically during refresh.\n                // If image generation fails, keep the article as a draft so one\n                // image failure never prevents the rest of the weekly refresh.\n                if (!inserted.image_url && normalizedArticle.image_prompt) {\n                    try {\n                        finalPost = await withRetry(
                            () => generateQueueImage(inserted),
                            "image generation for " + inserted.title
                        );\n                    } catch (imageError) {\n                        console.error(\n                            "AI news image generation failed; keeping article draft:",\n                            imageError\n                        );\n                    }\n                }\n\n                posts.push(finalPost);
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