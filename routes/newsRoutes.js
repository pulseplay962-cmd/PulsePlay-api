import dotenv from "dotenv";
dotenv.config();

import express from "express";
import { createClient } from "@supabase/supabase-js";
import { createSocialPost } from "../services/socialQueue.js";
import { researchGamingNews } from "../services/ai/researchService.js";
import { generateArticle, generateQueueImage } from "../services/ai/contentService.js";
import { requireAdmin } from "../middleware/adminAuth.js";
import { normalizeNewsUrl, normalizeNewsTitle, selectWeeklyCandidates } from "../services/ai/newsDeduplication.js";

console.log("🔥 NEWS ROUTES FILE LOADED");

const router = express.Router();

router.get("/test", (req, res) => {
    console.log("🔥 NEWS TEST ROUTE HIT");
    res.json({ success: true, message: "News route is working" });
});

console.log("NEWS ROUTE ENV CHECK:", process.env.SUPABASE_URL);

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

function isUsableGeneratedArticle(article) {
    const title = String(article?.title || "").trim();
    const body = String(article?.body || "").trim();

    if (title.length < 12 || body.length < 500) return false;

    const blockedPhrases = [
        "lorem ipsum",
        "insert article",
        "placeholder text",
        "as an ai",
        "i cannot verify"
    ];

    const lowerBody = body.toLowerCase();
    return !blockedPhrases.some(phrase => lowerBody.includes(phrase));
}

async function withRetry(operation, label, attempts = 2, timeoutMs = 60000) {
    let lastError;

    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            return await Promise.race([
                operation(),
                new Promise((_, reject) =>
                    setTimeout(
                        () => reject(new Error("Operation timed out after " + timeoutMs + "ms")),
                        timeoutMs
                    )
                )
            ]);
        } catch (error) {
            lastError = error;
            console.warn(
                "NEWS REFRESH " + label +
                " attempt " + attempt + "/" + attempts + " failed:",
                error?.message || error
            );

            if (attempt < attempts) {
                await new Promise(resolve => setTimeout(resolve, 1500));
            }
        }
    }

    throw lastError;
}

function selectWeeklyCandidates(research, existingTitles, existingSourceUrls) {
    // Seed the seen sets with saved records, then update them as each candidate
    // is accepted. This also prevents duplicate items returned in the same
    // research batch from being queued together.
    const seenTitles = new Set(existingTitles);
    const seenSourceUrls = new Set(existingSourceUrls);
    const fresh = [];

    for (const source of research) {
        const title = String(source.title || "").trim();
        const normalizedTitle = normalizeNewsTitle(title);
        const sourceUrl = normalizeNewsUrl(source.url);

        if (
            !title ||
            !sourceUrl ||
            seenTitles.has(normalizedTitle) ||
            isSimilarTitle(title, seenTitles) ||
            seenSourceUrls.has(sourceUrl)
        ) {
            continue;
        }

        fresh.push(source);
        seenTitles.add(normalizedTitle);
        seenSourceUrls.add(sourceUrl);
    }

    const gaming = fresh.filter(item => item.source_type === "gaming");
    const hardware = fresh.filter(item => item.source_type === "hardware");

    const selected = [
        ...gaming.slice(0, 3),
        ...hardware.slice(0, 2)
    ];

    if (selected.length < 5) {
        const selectedUrls = new Set(selected.map(item => normalizeNewsUrl(item.url)));
        for (const item of fresh) {
            if (selected.length >= 5) break;
            const url = normalizeNewsUrl(item.url);
            if (!selectedUrls.has(url)) {
                selected.push(item);
                selectedUrls.add(url);
            }
        }
    }

    return {
        selected,
        gamingAvailable: gaming.length,
        hardwareAvailable: hardware.length
    };
}

async function keepOnlyCurrentNewsDrafts(maxDrafts = 5) {
    const { data: drafts, error } = await supabase
        .from("ai_content_queue")
        .select("id, created_at")
        .eq("content_type", "news")
        .eq("status", "draft")
        .order("created_at", { ascending: false })
        .limit(1000);

    if (error) throw error;

    const staleIds = (drafts || [])
        .slice(maxDrafts)
        .map(item => item.id)
        .filter(Boolean);

    if (!staleIds.length) return 0;

    const { error: archiveError } = await supabase
        .from("ai_content_queue")
        .update({ status: "archived" })
        .in("id", staleIds);

    if (archiveError) throw archiveError;

    return staleIds.length;
}

function createTestImage(title) {
    const safeTitle = String(title || "PulsePlay Test").replace(/[&<>\"]/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;"
    }[char]));
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">
        <defs>
            <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0%" stop-color="#070b14"/>
                <stop offset="55%" stop-color="#160b2d"/>
                <stop offset="100%" stop-color="#02040a"/>
            </linearGradient>
        </defs>
        <rect width="1200" height="675" fill="url(#bg)"/>
        <rect x="55" y="55" width="1090" height="565" rx="28" fill="none" stroke="#22d3ee" stroke-opacity=".35" stroke-width="3"/>
        <text x="90" y="150" fill="#22d3ee" font-family="Arial,sans-serif" font-size="34" font-weight="700">PULSEPLAY • TEST MODE</text>
        <text x="90" y="215" fill="#ffffff" font-family="Arial,sans-serif" font-size="46" font-weight="800">NO OPENAI CREDITS USED</text>
        <foreignObject x="90" y="275" width="1020" height="220">
            <div xmlns="http://www.w3.org/1999/xhtml" style="font-family:Arial,sans-serif;color:#cbd5e1;font-size:28px;line-height:1.35;">${safeTitle}</div>
        </foreignObject>
        <text x="90" y="565" fill="#8b5cf6" font-family="Arial,sans-serif" font-size="26" font-weight="700">Research + dedupe + weekly candidate selection</text>
    </svg>`;
    return "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");
}

function buildTestArticle(source, lane, index) {
    const summary = String(source.summary || "No source summary was provided.").trim();
    const sourceName = source.source || "Gaming/technology news feed";
    const sourceDate = source.published_at || "Unknown";
    const body = [
        `TEST MODE — This is a simulated PulsePlay draft created without calling OpenAI. It is not intended for publication. The test is using the live research feed, freshness checks, duplicate checks, and weekly lane selection.`,
        `\n\nThe selected ${lane === "hardware" ? "hardware and gaming accessory" : "gaming"} story is “${source.title}.” The research source is ${sourceName}, with a reported publication date of ${sourceDate}. The source summary supplied to the test pipeline says: ${summary}`,
        `\n\nIn production, this source would be passed to the AI article generator with instructions to preserve verified facts, avoid invented details, clearly attribute unconfirmed claims, and produce a clean PulsePlay news article. In this no-credit test, those AI calls are deliberately skipped so the workflow can be validated without consuming OpenAI text or image credits.`,
        `\n\nThe test also verifies the downstream shape expected by the AI Content Studio: headline, article body, social caption, image prompt, hashtags, source name, source URL, content lane, and a non-published draft marker. No database queue insert or publication action occurs during this test.`,
        `\n\nSource URL: ${source.url}`
    ].join("");
    return {
        id: `test-${Date.now()}-${index}`,
        title: `[TEST] ${source.title}`,
        content_type: "news",
        category: lane === "hardware" ? "Gaming Hardware & Gear" : "Gaming News & Updates",
        body,
        social_caption: `[TEST] PulsePlay research draft: ${source.title}`,
        image_prompt: `PulsePlay editorial gaming image for: ${source.title}. Dark futuristic gaming command center aesthetic, cyan and purple neon, no logos, no text.`,
        hashtags: ["#PulsePlay", lane === "hardware" ? "#GamingHardware" : "#GamingNews", "#TestMode"],
        image_url: createTestImage(source.title),
        source_url: normalizeNewsUrl(source.url),
        source_name: sourceName,
        status: "test",
        scheduled_date: new Date().toISOString().split("T")[0],
        content_lane: lane,
        test_mode: true
    };
}

router.post("/refresh-ai", requireAdmin, async (req, res) => {
    try {
        const testMode = String(req.query?.test || "").toLowerCase() === "true";
        console.log("=================================");
        if (testMode) console.log("PULSEPLAY NO-CREDIT TEST MODE");
        console.log("PULSEPLAY AI GAMING + HARDWARE REFRESH");
        console.log("=================================");

        const research = await researchGamingNews();

        if (!research.length) {
            return res.status(502).json({
                success: false,
                error: "No current gaming or hardware news was returned by the research sources."
            });
        }

        const [queueResult, newsResult] = await Promise.all([
            supabase
                .from("ai_content_queue")
                .select("title, source_url")
                .order("created_at", { ascending: false })
                .limit(2000),
            supabase
                .from("news")
                .select("title, source_url")
                .order("created_at", { ascending: false })
                .limit(2000)
        ]);

        if (queueResult.error) throw queueResult.error;
        if (newsResult.error) throw newsResult.error;

        // Compare against both queued drafts and existing site articles, including
        // archived queue records, so an old story is not silently reintroduced.
        const knownRecords = [
            ...(queueResult.data || []),
            ...(newsResult.data || [])
        ];
        const existingTitles = new Set(
            knownRecords
                .map(item => normalizeNewsTitle(item.title))
                .filter(Boolean)
        );

        const existingSourceUrls = new Set(
            knownRecords
                .map(item => normalizeNewsUrl(item.source_url))
                .filter(Boolean)
        );

        const { selected: freshSources, gamingAvailable, hardwareAvailable } =
            selectWeeklyCandidates(research, existingTitles, existingSourceUrls);

        if (testMode) {
            const posts = freshSources.map((source, index) =>
                buildTestArticle(
                    source,
                    source.source_type === "hardware" ? "hardware" : "gaming",
                    index
                )
            );

            return res.json({
                success: true,
                test_mode: true,
                created: posts.length,
                researched: research.length,
                candidates: freshSources.length,
                gaming_available: gamingAvailable,
                hardware_available: hardwareAvailable,
                openai_calls: 0,
                database_writes: 0,
                published: 0,
                message: `NO-CREDIT TEST: generated ${posts.length} simulated draft(s). No OpenAI calls, queue inserts, or publishing occurred.`,
                posts
            });
        }

        if (!freshSources.length) {
            return res.json({
                success: true,
                created: 0,
                researched: research.length,
                gaming_available: gamingAvailable,
                hardware_available: hardwareAvailable,
                archived_drafts: 0,
                message: "No new gaming or hardware news was found that is not already in the queue or published news. Existing drafts were left unchanged.",
                posts: []
            });
        }

        const posts = [];
        const imageJobs = [];

        for (const source of freshSources) {
            const lane = source.source_type === "hardware" ? "hardware" : "gaming";
            const topic = [
                "Write a fresh PulsePlay news article based ONLY on the verified research below.",
                lane === "hardware"
                    ? "This is a CURRENT GAMING HARDWARE / ACCESSORIES TREND story. Focus on meaningful developments involving GPUs, CPUs, gaming PCs, laptops, monitors, keyboards, mice, headsets, microphones, streaming gear, controllers, storage, networking, gaming accessories, launches, announcements, technology changes, pricing/availability developments, or notable industry trends. Do not turn it into a generic buying guide, product ranking, review, poll, or evergreen tips article."
                    : "This is a CURRENT VIDEO-GAME NEWS story. Focus on announcements, releases, delays, updates, expansions, platforms, studios, publishers, events, industry developments, or other timely gaming news. Do not turn it into a gear guide, poll, weekend picks, gaming tips, or evergreen advice article.",
                "Create a clean, natural PulsePlay headline that reads like a real news headline. Do not copy an RSS headline verbatim and do not use generic templates such as 'What to Look For' unless the verified source itself genuinely requires that wording.",
                "Preserve official game, hardware, studio, publisher, manufacturer, product, platform, and event names exactly when known.",
                "Do not invent facts, dates, prices, quotes, specifications, announcements, features, benchmarks, or statistics.",
                "Clearly distinguish confirmed information from speculation and omit unsupported speculation.",
                "If the source reports a claim that is not independently confirmed, attribute it clearly rather than presenting it as established fact.",
                `Content lane: ${lane}`,
                `Source: ${source.source || "Gaming/technology news feed"}`,
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

            const normalizedArticle = {
                title: article?.title || "",
                body: article?.article || article?.body || "",
                social_caption: article?.facebookPost || article?.social_caption || "",
                image_prompt: article?.imagePrompt || article?.image_prompt || "",
                hashtags: Array.isArray(article?.hashtags) ? article.hashtags : []
            };

            if (!isUsableGeneratedArticle(normalizedArticle)) {
                console.warn("AI news article skipped by quality validation:", source.title);
                continue;
            }

            const scheduledDate = new Date().toISOString().split("T")[0];

            const { data: inserted, error: insertError } = await supabase
                .from("ai_content_queue")
                .insert({
                    title: normalizedArticle.title,
                    content_type: "news",
                    category: lane === "hardware" ? "Gaming Hardware & Gear" : "Gaming News & Updates",
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
                console.error("AI news queue insert failed:", insertError);
                continue;
            }

            posts.push({
                ...inserted,
                content_lane: lane
            });

            if (!inserted.image_url && normalizedArticle.image_prompt) {
                imageJobs.push(
                    withRetry(
                        () => generateQueueImage(inserted),
                        "image generation for " + inserted.title,
                        1,
                        75000
                    )
                        .then(updatedPost => {
                            const index = posts.findIndex(post => post.id === inserted.id);
                            if (index >= 0) {
                                posts[index] = {
                                    ...updatedPost,
                                    content_lane: lane
                                };
                            }
                            return updatedPost;
                        })
                        .catch(imageError => {
                            console.error(
                                "AI news image generation failed; keeping article draft:",
                                inserted.title,
                                imageError
                            );
                            return inserted;
                        })
                );
            }
        }

        // Keep older drafts intact; refresh must never silently archive user-reviewable work.
        const archivedDrafts = 0;

        if (imageJobs.length) {
            // Wait for image generation and database updates before returning the
            // refreshed drafts, so the admin UI receives their final image_url values.
            const imageResults = await Promise.allSettled(imageJobs);
            console.log(
                "AI news image jobs finished:",
                imageResults.filter(result => result.status === "fulfilled").length,
                "/",
                imageResults.length
            );
        }

        return res.json({
            success: true,
            created: posts.length,
            archived_drafts: archivedDrafts,
            researched: research.length,
            candidates: freshSources.length,
            gaming_available: gamingAvailable,
            hardware_available: hardwareAvailable,
            message:
                posts.length > 0
                    ? `Created ${posts.length} fresh gaming/hardware news draft(s); existing drafts were left unchanged.`
                    : "Fresh sources were found, but the AI could not produce complete articles from the available candidates.",
            posts
        });
    } catch (error) {
        console.error("AI news refresh error:", error);

        return res.status(500).json({
            success: false,
            error: error.message || "Unable to refresh AI gaming and hardware news."
        });
    }
});

router.post("/publish", requireAdmin, async (req, res) => {
    try {
        const {
            title,
            slug,
            excerpt,
            content,
            image,
            category,
            author,
            source_url,
            source_name
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
                    source_url: normalizeNewsUrl(source_url || ""),
                    source_name: source_name || "",
                    published: true,
                    status: "published"
                }
            ])
            .select()
            .single();

        if (error) {
            console.error("Publish insert error:", error);
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
            console.error("Facebook social post creation failed:", socialError);
        }

        return res.json({
            success: true,
            article: data
        });
    } catch (error) {
        console.error("Publish route error:", error);

        return res.status(500).json({
            success: false,
            error: "Unable to publish article."
        });
    }
});

console.log("NEWS ROUTER READY");

export default router;
