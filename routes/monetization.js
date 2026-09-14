import express from "express";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "../middleware/adminAuth.js";

const router = express.Router();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ALLOWED_STATUSES = new Set(["active", "inactive"]);

function cleanString(value, maxLength = 500) {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed ? trimmed.slice(0, maxLength) : null;
}

function isValidHttpUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:";
    } catch {
        return false;
    }
}

async function getProductDetails(productIds) {
    const ids = [...new Set((productIds || []).filter(Boolean))];

    if (!ids.length) return {};

    const { data, error } = await supabase
        .from("products")
        .select("id, name, description, price, image, category")
        .in("id", ids);

    if (error) {
        console.error("Affiliate product lookup error:", error);
        return {};
    }

    return Object.fromEntries((data || []).map((product) => [product.id, product]));
}

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

// Admin: list affiliate links for management.
router.get("/links", requireAdmin, async (req, res) => {
    try {
        const { data: links, error } = await supabase
            .from("affiliate_links")
            .select(
                "id, product_id, network, merchant, affiliate_url, tracking_code, status, clicks, conversions, revenue, created_at, updated_at"
            )
            .order("created_at", { ascending: false });

        if (error) {
            throw error;
        }

        const products = await getProductDetails(
            (links || []).map((link) => link.product_id)
        );

        return res.json({
            success: true,
            links: (links || []).map((link) => ({
                ...link,
                product: link.product_id ? products[link.product_id] || null : null
            }))
        });
    } catch (error) {
        console.error("Affiliate links load error:", error);
        return res.status(500).json({
            success: false,
            error: error.message || "Unable to load affiliate links."
        });
    }
});

// Admin: create an affiliate link.
router.post("/links", requireAdmin, async (req, res) => {
    try {
        const productId = cleanString(req.body?.product_id, 100);
        const network = cleanString(req.body?.network, 100);
        const merchant = cleanString(req.body?.merchant, 150);
        const affiliateUrl = cleanString(req.body?.affiliate_url, 2000);
        const trackingCode = cleanString(req.body?.tracking_code, 300);
        const status = cleanString(req.body?.status, 20) || "active";

        if (!network) {
            return res.status(400).json({
                success: false,
                error: "Affiliate network is required."
            });
        }

        if (!affiliateUrl || !isValidHttpUrl(affiliateUrl)) {
            return res.status(400).json({
                success: false,
                error: "A valid http or https affiliate URL is required."
            });
        }

        if (!ALLOWED_STATUSES.has(status)) {
            return res.status(400).json({
                success: false,
                error: "Status must be active or inactive."
            });
        }

        if (productId) {
            const { data: product, error: productError } = await supabase
                .from("products")
                .select("id")
                .eq("id", productId)
                .maybeSingle();

            if (productError) throw productError;

            if (!product) {
                return res.status(400).json({
                    success: false,
                    error: "Selected product was not found."
                });
            }
        }

        const { data, error } = await supabase
            .from("affiliate_links")
            .insert({
                product_id: productId || null,
                network,
                merchant,
                affiliate_url: affiliateUrl,
                tracking_code: trackingCode,
                status
            })
            .select(
                "id, product_id, network, merchant, affiliate_url, tracking_code, status, clicks, conversions, revenue, created_at, updated_at"
            )
            .single();

        if (error) throw error;

        return res.status(201).json({
            success: true,
            link: data
        });
    } catch (error) {
        console.error("Affiliate link create error:", error);
        return res.status(500).json({
            success: false,
            error: error.message || "Unable to create affiliate link."
        });
    }
});

// Admin: update an affiliate link.
router.put("/links/:id", requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const updates = {};

        if (req.body?.product_id !== undefined) {
            const productId = cleanString(req.body.product_id, 100);

            if (productId) {
                const { data: product, error: productError } = await supabase
                    .from("products")
                    .select("id")
                    .eq("id", productId)
                    .maybeSingle();

                if (productError) throw productError;

                if (!product) {
                    return res.status(400).json({
                        success: false,
                        error: "Selected product was not found."
                    });
                }
            }

            updates.product_id = productId || null;
        }

        if (req.body?.network !== undefined) {
            const network = cleanString(req.body.network, 100);
            if (!network) {
                return res.status(400).json({
                    success: false,
                    error: "Affiliate network cannot be empty."
                });
            }
            updates.network = network;
        }

        if (req.body?.merchant !== undefined) {
            updates.merchant = cleanString(req.body.merchant, 150);
        }

        if (req.body?.affiliate_url !== undefined) {
            const affiliateUrl = cleanString(req.body.affiliate_url, 2000);

            if (!affiliateUrl || !isValidHttpUrl(affiliateUrl)) {
                return res.status(400).json({
                    success: false,
                    error: "A valid http or https affiliate URL is required."
                });
            }

            updates.affiliate_url = affiliateUrl;
        }

        if (req.body?.tracking_code !== undefined) {
            updates.tracking_code = cleanString(req.body.tracking_code, 300);
        }

        if (req.body?.status !== undefined) {
            const status = cleanString(req.body.status, 20);

            if (!status || !ALLOWED_STATUSES.has(status)) {
                return res.status(400).json({
                    success: false,
                    error: "Status must be active or inactive."
                });
            }

            updates.status = status;
        }

        if (!Object.keys(updates).length) {
            return res.status(400).json({
                success: false,
                error: "No valid affiliate link fields were provided."
            });
        }

        updates.updated_at = new Date().toISOString();

        const { data, error } = await supabase
            .from("affiliate_links")
            .update(updates)
            .eq("id", id)
            .select(
                "id, product_id, network, merchant, affiliate_url, tracking_code, status, clicks, conversions, revenue, created_at, updated_at"
            )
            .maybeSingle();

        if (error) throw error;

        if (!data) {
            return res.status(404).json({
                success: false,
                error: "Affiliate link not found."
            });
        }

        return res.json({
            success: true,
            link: data
        });
    } catch (error) {
        console.error("Affiliate link update error:", error);
        return res.status(500).json({
            success: false,
            error: error.message || "Unable to update affiliate link."
        });
    }
});

// Admin: deactivate an affiliate link without deleting its click/revenue history.
router.delete("/links/:id", requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        const { data, error } = await supabase
            .from("affiliate_links")
            .update({
                status: "inactive",
                updated_at: new Date().toISOString()
            })
            .eq("id", id)
            .select("id, status, updated_at")
            .maybeSingle();

        if (error) throw error;

        if (!data) {
            return res.status(404).json({
                success: false,
                error: "Affiliate link not found."
            });
        }

        return res.json({
            success: true,
            link: data,
            message: "Affiliate link deactivated."
        });
    } catch (error) {
        console.error("Affiliate link deactivate error:", error);
        return res.status(500).json({
            success: false,
            error: error.message || "Unable to deactivate affiliate link."
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
