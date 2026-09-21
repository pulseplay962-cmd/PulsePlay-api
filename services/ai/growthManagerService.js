import openai, { isAIProductionMode } from "./openaiService.js";
import { supabase } from "../../lib/supabase.js";

const AI_MODEL = process.env.PULSEAI_ASSISTANT_MODEL || process.env.PULSEAI_MODEL || "gpt-4.1-mini";

function clean(value, max = 1200) {
    return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

async function loadSignals() {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [{ data: pageViews, error: pageViewsError }, { data: clicks, error: clicksError }, { data: links, error: linksError }] = await Promise.all([
        supabase.from("analytics_events").select("page_path").eq("event_type", "page_view").gte("created_at", thirtyDaysAgo).limit(10000),
        supabase.from("affiliate_clicks").select("page_path, product_id").gte("created_at", thirtyDaysAgo).limit(5000),
        supabase.from("affiliate_links").select("id, product_id, status, merchant").eq("status", "active")
    ]);

    if (pageViewsError) throw pageViewsError;
    if (clicksError) throw clicksError;
    if (linksError) throw linksError;

    const views = new Map();
    for (const row of pageViews || []) {
        const path = row.page_path || "/";
        views.set(path, (views.get(path) || 0) + 1);
    }

    const clickMap = new Map();
    for (const row of clicks || []) {
        if (!row.page_path) continue;
        clickMap.set(row.page_path, (clickMap.get(row.page_path) || 0) + 1);
    }

    const performance = [...views.entries()]
        .map(([page_path, pageViewsCount]) => ({
            page_path,
            views: pageViewsCount,
            clicks: clickMap.get(page_path) || 0,
            click_rate: pageViewsCount ? ((clickMap.get(page_path) || 0) / pageViewsCount) * 100 : 0
        }))
        .sort((a, b) => b.views - a.views);

    const gap = performance.find((page) => page.views >= 10 && page.clicks === 0);
    const strongest = performance.filter((page) => page.clicks > 0).sort((a, b) => b.click_rate - a.click_rate)[0];

    const productClicks = new Map();
    for (const row of clicks || []) {
        if (!row.product_id || !row.page_path) continue;
        const key = row.product_id + "::" + row.page_path;
        productClicks.set(key, (productClicks.get(key) || 0) + 1);
    }

    const productIds = [...new Set((clicks || []).map((row) => row.product_id).filter(Boolean))];
    const { data: products, error: productsError } = productIds.length
        ? await supabase.from("products").select("id, name, description, category, price").in("id", productIds)
        : { data: [], error: null };

    if (productsError) throw productsError;

    const productById = Object.fromEntries((products || []).map((product) => [product.id, product]));
    const productSignal = [...productClicks.entries()]
        .map(([key, count]) => {
            const [productId, pagePath] = key.split("::");
            return {
                product_id: productId,
                product_name: productById[productId]?.name || "Gaming gear",
                page_path: pagePath,
                clicks: count,
                category: productById[productId]?.category || null
            };
        })
        .sort((a, b) => b.clicks - a.clicks)[0];

    return {
        gap,
        strongest,
        productSignal,
        activeAffiliateLinks: links?.length || 0
    };
}

async function generateGrowthDraft(signals) {
    if (!isAIProductionMode()) {
        throw new Error("PulsePlay AI is not in production mode.");
    }

    const target = signals.gap || signals.strongest;
    const topic = target
        ? target.page_path
        : signals.productSignal?.product_name || "gaming gear";

    const response = await openai.responses.create({
        model: AI_MODEL,
        instructions: [
            "You are the PulsePlay AI Growth Manager.",
            "Create one useful, factual gaming content draft based ONLY on the supplied PulsePlay growth signals.",
            "Do not invent traffic numbers, product specifications, prices, game facts, or community reactions.",
            "If a page path is supplied, use it only as an internal PulsePlay reference and do not invent its page title.",
            "The article should naturally create an opportunity for relevant internal links or gaming gear recommendations.",
            "Return ONLY valid JSON with title, category, body, social_caption, image_prompt."
        ].join("\n"),
        input: JSON.stringify({
            growth_signals: signals,
            target
        }),
        max_output_tokens: 1400
    });

    const raw = response.output_text || "";
    let result;
    try {
        result = JSON.parse(raw);
    } catch {
        throw new Error("Growth Manager returned invalid JSON.");
    }

    if (!result.title || !result.body) {
        throw new Error("Growth Manager returned an incomplete content draft.");
    }

    return result;
}

export async function runGrowthManager() {
    const signals = await loadSignals();
    const draft = await generateGrowthDraft(signals);

    const scheduledDate = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
        .from("ai_content_queue")
        .insert({
            title: clean(draft.title, 180),
            content_type: "article",
            category: clean(draft.category || "Gaming", 100),
            body: clean(draft.body, 12000),
            social_caption: clean(draft.social_caption, 1000),
            image_prompt: clean(draft.image_prompt, 1200),
            scheduled_date: scheduledDate,
            status: "pending"
        })
        .select()
        .single();

    if (error) throw error;

    return {
        success: true,
        action: "draft_created",
        queueItem: data,
        signals
    };
}
