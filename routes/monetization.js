import express from "express";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "../middleware/adminAuth.js";

const router = express.Router();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Public affiliate redirect + click tracking.
// The affiliate destination stays server-side so the frontend does not
// need direct access to affiliate URLs.
router.get("/go/:id", async (req, res) => {
    try {
        const { id } = req.params;

        const { data: link, error } = await supabase
            .from("affiliate_links")
            .select("id, product_id, affiliate_url, status")
            .eq("id", id)
            .maybeSingle();

        if (error) {
            console.error("Affiliate link lookup error:", error);
            return res.status(500).json({
                success: false,
                error: "Unable to process affiliate link."
            });
        }

        if (!link || link.status !== "active") {
            return res.status(404).json({
                success: false,
                error: "Affiliate link not found."
            });
        }

        const sessionId =
            typeof req.query.session_id === "string"
                ? req.query.session_id.slice(0, 200)
                : null;

        const pagePath =
            typeof req.query.page_path === "string"
                ? req.query.page_path.slice(0, 500)
                : null;

        const campaign =
            typeof req.query.campaign === "string"
                ? req.query.campaign.slice(0, 200)
                : null;

        const referrer =
            typeof req.get("referer") === "string"
                ? req.get("referer").slice(0, 1000)
                : null;

        // Log the click. A failed analytics insert must not prevent the
        // customer from reaching the merchant.
        const { error: clickError } = await supabase
            .from("affiliate_clicks")
            .insert({
                affiliate_link_id: link.id,
                product_id: link.product_id,
                session_id: sessionId,
                page_path: pagePath,
                referrer,
                campaign
            });

        if (clickError) {
            console.error("Affiliate click log error:", clickError);
        }

        const { error: incrementError } = await supabase.rpc(
            "increment_affiliate_clicks",
            { link_id: link.id }
        );

        // The RPC is intentionally optional for the first deployment. If it
        // does not exist yet, the click event above is still recorded.
        if (incrementError) {
            console.warn(
                "Affiliate click counter RPC unavailable:",
                incrementError.message
            );
        }

        return res.redirect(302, link.affiliate_url);
    } catch (error) {
        console.error("Affiliate redirect error:", error);
        return res.status(500).json({
            success: false,
            error: "Unable to process affiliate link."
        });
    }
});

// Admin: affiliate performance summary.
router.get("/stats", requireAdmin, async (req, res) => {
    try {
        const { data: links, error: linksError } = await supabase
            .from("affiliate_links")
            .select("id, product_id, network, merchant, status, clicks, conversions, revenue, created_at")
            .order("clicks", { ascending: false });

        if (linksError) {
            throw linksError;
        }

        const { data: recentClicks, error: clicksError } = await supabase
            .from("affiliate_clicks")
            .select("id, affiliate_link_id, product_id, page_path, campaign, created_at")
            .order("created_at", { ascending: false })
            .limit(100);

        if (clicksError) {
            throw clicksError;
        }

        const totalClicks = (links || []).reduce(
            (sum, item) => sum + Number(item.clicks || 0),
            0
        );

        const totalConversions = (links || []).reduce(
            (sum, item) => sum + Number(item.conversions || 0),
            0
        );

        const totalRevenue = (links || []).reduce(
            (sum, item) => sum + Number(item.revenue || 0),
            0
        );

        return res.json({
            success: true,
            summary: {
                totalLinks: links?.length || 0,
                totalClicks,
                totalConversions,
                totalRevenue
            },
            links: links || [],
            recentClicks: recentClicks || []
        });
    } catch (error) {
        console.error("Monetization stats error:", error);
        return res.status(500).json({
            success: false,
            error: error.message || "Unable to load monetization stats."
        });
    }
});

// Admin: read monetization settings.
router.get("/settings", requireAdmin, async (req, res) => {
    try {
        const { data, error } = await supabase
            .from("monetization_settings")
            .select("*")
            .limit(1)
            .maybeSingle();

        if (error) {
            throw error;
        }

        return res.json({
            success: true,
            settings: data || null
        });
    } catch (error) {
        console.error("Monetization settings load error:", error);
        return res.status(500).json({
            success: false,
            error: error.message || "Unable to load monetization settings."
        });
    }
});

// Admin: update monetization settings.
router.put("/settings", requireAdmin, async (req, res) => {
    try {
        const allowed = {
            ads_enabled: req.body?.ads_enabled,
            affiliate_enabled: req.body?.affiliate_enabled,
            merch_enabled: req.body?.merch_enabled,
            sponsorship_enabled: req.body?.sponsorship_enabled,
            adsense_publisher_id: req.body?.adsense_publisher_id,
            default_affiliate_network: req.body?.default_affiliate_network
        };

        const updates = Object.fromEntries(
            Object.entries(allowed).filter(([, value]) => value !== undefined)
        );

        updates.updated_at = new Date().toISOString();

        const { data: existing, error: existingError } = await supabase
            .from("monetization_settings")
            .select("id")
            .limit(1)
            .maybeSingle();

        if (existingError) {
            throw existingError;
        }

        let result;

        if (existing?.id) {
            result = await supabase
                .from("monetization_settings")
                .update(updates)
                .eq("id", existing.id)
                .select("*")
                .single();
        } else {
            result = await supabase
                .from("monetization_settings")
                .insert(updates)
                .select("*")
                .single();
        }

        if (result.error) {
            throw result.error;
        }

        return res.json({
            success: true,
            settings: result.data
        });
    } catch (error) {
        console.error("Monetization settings update error:", error);
        return res.status(500).json({
            success: false,
            error: error.message || "Unable to update monetization settings."
        });
    }
});

export default router;
