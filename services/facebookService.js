import { supabase } from "../lib/supabase.js";

const GRAPH_VERSION = process.env.FACEBOOK_GRAPH_VERSION || "v26.0";

function getFacebookConfig() {
    const pageId = process.env.FACEBOOK_PAGE_ID?.trim();
    const accessToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN?.trim();

    return {
        pageId,
        accessToken,
        enabled: Boolean(pageId && accessToken)
    };
}

export function isFacebookPublishingEnabled() {
    return getFacebookConfig().enabled;
}

export async function publishToFacebook({
    message = "",
    link = ""
} = {}) {
    const { pageId, accessToken, enabled } = getFacebookConfig();

    if (!enabled) {
        return {
            success: false,
            skipped: true,
            reason: "Facebook publishing is not configured."
        };
    }

    const text = String(message || "").trim();

    if (!text) {
        throw new Error("Facebook post message is required.");
    }

    const params = new URLSearchParams();
    params.set("message", text);
    params.set("access_token", accessToken);

    if (link) {
        params.set("link", String(link).trim());
    }

    const response = await fetch(
        `https://graph.facebook.com/${GRAPH_VERSION}/${pageId}/feed`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body: params.toString()
        }
    );

    const result = await response.json();

    if (!response.ok || result.error) {
        const messageText =
            result?.error?.message ||
            `Facebook Graph API returned HTTP ${response.status}.`;

        throw new Error(messageText);
    }

    return {
        success: true,
        postId: result.id || null,
        raw: result
    };
}

export async function markSocialPostPosted({
    socialQueueId,
    facebookPostId
}) {
    if (!socialQueueId) {
        return;
    }

    const { error } = await supabase
        .from("social_queue")
        .update({
            status: "posted"
        })
        .eq("id", socialQueueId);

    if (error) {
        console.error(
            "FACEBOOK SOCIAL QUEUE UPDATE ERROR:",
            error
        );
        return;
    }

    console.log(
        "FACEBOOK POST PUBLISHED:",
        {
            socialQueueId,
            facebookPostId
        }
    );
}
