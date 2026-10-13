import { supabase } from "../lib/supabase.js";

const GRAPH_VERSION = process.env.FACEBOOK_GRAPH_VERSION || "v26.0";
const DEFAULT_SOCIAL_IMAGE = "https://pulseplay.online/pulseplay-command-center-bg.jpg";

function getFacebookConfig() {
    const pageId = process.env.FACEBOOK_PAGE_ID?.trim();
    const accessToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN?.trim();
    return { pageId, accessToken, enabled: Boolean(pageId && accessToken) };
}

export function isFacebookPublishingEnabled() {
    return getFacebookConfig().enabled;
}

async function getPageAccessToken({ pageId, systemUserToken }) {
    const response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${pageId}?fields=access_token&access_token=${encodeURIComponent(systemUserToken)}`);
    const result = await response.json();
    if (!response.ok || result.error || !result.access_token) {
        throw new Error(result?.error?.message || `Facebook Page access-token lookup returned HTTP ${response.status}.`);
    }
    return result.access_token;
}

export async function getFacebookPageAccessToken() {
    const { pageId, accessToken, enabled } = getFacebookConfig();
    if (!enabled) return { success: false, reason: "Facebook publishing is not configured." };
    const pageAccessToken = await getPageAccessToken({ pageId, systemUserToken: accessToken });
    return { success: true, pageId, pageAccessToken };
}

export async function publishToFacebook({ message = "", link = "", imageUrl = "" } = {}) {
    const { pageId, accessToken, enabled } = getFacebookConfig();
    if (!enabled) return { success: false, skipped: true, reason: "Facebook publishing is not configured." };

    const text = String(message || "").trim();
    if (!text) throw new Error("Facebook post message is required.");

    const pageAccessToken = await getPageAccessToken({ pageId, systemUserToken: accessToken });

    // /feed creates text/link posts; images must be sent to the Page /photos endpoint.
    // Use a public PulsePlay image when the queue has no fetchable HTTP(S) image URL.
    const suppliedImageUrl = String(imageUrl || "").trim();
    const usableImageUrl = /^https?:\/\//i.test(suppliedImageUrl)
        ? suppliedImageUrl
        : DEFAULT_SOCIAL_IMAGE;

    const params = new URLSearchParams();
    params.set("access_token", pageAccessToken);

    let endpoint;
    if (usableImageUrl) {
        // Preserve the website click-through when publishing via /photos.
        params.set("message", link ? `${text}\n\nRead more: ${link}` : text);
        params.set("url", usableImageUrl);
        endpoint = `https://graph.facebook.com/${GRAPH_VERSION}/${pageId}/photos`;
    } else {
        params.set("message", text);
        if (link) params.set("link", String(link).trim());
        endpoint = `https://graph.facebook.com/${GRAPH_VERSION}/${pageId}/feed`;
    }

    const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString()
    });
    const result = await response.json();

    if (!response.ok || result.error) {
        throw new Error(result?.error?.message || `Facebook Graph API returned HTTP ${response.status}.`);
    }

    return { success: true, postId: result.post_id || result.id || null, raw: result };
}

export async function markSocialPostPosted({ socialQueueId, facebookPostId }) {
    if (!socialQueueId) return;

    const { error } = await supabase
        .from("social_queue")
        .update({ status: "posted" })
        .eq("id", socialQueueId);

    if (error) {
        console.error("FACEBOOK SOCIAL QUEUE UPDATE ERROR:", error);
        return;
    }

    console.log("FACEBOOK POST PUBLISHED:", { socialQueueId, facebookPostId });
}
