import express from "express";
import { createClient } from "@supabase/supabase-js";

const router = express.Router();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

function normalize(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

function tokens(value) {
    return new Set(normalize(value).split(/\s+/).filter((word) => word.length >= 3));
}

function scoreProduct(product, context) {
    const productWords = tokens(`${product.name} ${product.category || ""} ${product.description || ""}`);
    const contextWords = tokens(`${context.title} ${context.category} ${context.description || ""}`);

    let score = 0;

    if (context.category && product.category && normalize(context.category) === normalize(product.category)) {
        score += 10;
    }

    for (const word of contextWords) {
        if (productWords.has(word)) score += 2;
    }

    return score;
}

async function getContext(path) {
    const cleanPath = typeof path === "string" ? path.split("?")[0].replace(/\/+$/, "") : "";

    if (cleanPath.startsWith("/news/")) {
        const slug = decodeURIComponent(cleanPath.slice("/news/".length));
        if (!slug) return null;

        const { data, error } = await supabase
            .from("news")
            .select("id, title, category, excerpt, content")
            .eq("slug", slug)
            .maybeSingle();

        if (error) throw error;
        return data ? { ...data, type: "news" } : null;
    }

    if (cleanPath.startsWith("/games/")) {
        const id = decodeURIComponent(cleanPath.slice("/games/".length));
        if (!id) return null;

        const { data, error } = await supabase
            .from("games")
            .select("id, title, genre, category, description")
            .or(`id.eq.${id},slug.eq.${id}`)
            .maybeSingle();

        if (error) throw error;
        return data
            ? {
                ...data,
                category: data.category || data.genre,
                type: "game"
            }
            : null;
    }

    return null;
}


async function getRelatedContent(context, limit = 3) {
    const sourceWords = tokens(
        `${context.title} ${context.category || ""} ${context.description || ""}`
    );

    const candidates = [];

    if (context.type !== "news") {
        const { data: news, error } = await supabase
            .from("news")
            .select("id, title, slug, category, excerpt")
            .eq("published", true)
            .limit(50);

        if (error) throw error;

        for (const item of news || []) {
            candidates.push({
                type: "news",
                id: item.id,
                title: item.title,
                category: item.category,
                excerpt: item.excerpt,
                path: `/news/${item.slug}`
            });
        }
    }

    if (context.type !== "game") {
        const { data: games, error } = await supabase
            .from("games")
            .select("id, title, slug, genre, category, description")
            .limit(50);

        if (error) throw error;

        for (const item of games || []) {
            candidates.push({
                type: "game",
                id: item.id,
                title: item.title,
                category: item.category || item.genre,
                excerpt: item.description,
                path: `/games/${item.slug || item.id}`
            });
        }
    }

    return candidates
        .map((item) => {
            const itemWords = tokens(
                `${item.title} ${item.category || ""} ${item.excerpt || ""}`
            );

            let score = 0;
            if (
                context.category &&
                item.category &&
                normalize(context.category) === normalize(item.category)
            ) {
                score += 10;
            }

            for (const word of sourceWords) {
                if (itemWords.has(word)) score += 2;
            }

            return { ...item, score };
        })
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(({ score, ...item }) => item);
}

router.get("/", async (req, res) => {
    try {
        const path = typeof req.query.path === "string" ? req.query.path.slice(0, 1000) : "";
        const limit = Math.min(Math.max(Number(req.query.limit) || 3, 1), 6);
        const context = await getContext(path);

        if (!context) {
            return res.json({ success: true, recommendations: [] });
        }

        const { data: links, error: linkError } = await supabase
            .from("affiliate_links")
            .select("id, product_id, merchant, network, status")
            .eq("status", "active")
            .not("product_id", "is", null);

        if (linkError) throw linkError;

        const productIds = [...new Set((links || []).map((link) => link.product_id).filter(Boolean))];
        if (!productIds.length) {
            return res.json({ success: true, recommendations: [] });
        }

        const { data: products, error: productError } = await supabase
            .from("products")
            .select("id, name, description, price, image, category")
            .in("id", productIds);

        if (productError) throw productError;

        const productMap = new Map((products || []).map((product) => [product.id, product]));

        const recommendations = (links || [])
            .map((link) => {
                const product = productMap.get(link.product_id);
                if (!product) return null;

                return {
                    affiliateLinkId: link.id,
                    merchant: link.merchant,
                    network: link.network,
                    product,
                    score: scoreProduct(product, context)
                };
            })
            .filter(Boolean)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .map(({ score, ...recommendation }) => recommendation);

        const relatedContent = await getRelatedContent(context, 3);

        return res.json({
            success: true,
            context: {
                id: context.id,
                type: context.type,
                title: context.title,
                category: context.category || null
            },
            recommendations,
            relatedContent
        });
    } catch (error) {
        console.error("Affiliate recommendations error:", error);
        return res.status(500).json({
            success: false,
            error: "Unable to load affiliate recommendations."
        });
    }
});

export default router;
