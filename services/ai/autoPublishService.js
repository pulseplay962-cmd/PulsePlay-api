import { supabase } from "../../lib/supabase.js";
import { publishAIContent } from "./publisherService.js";

const AUTO_PUBLISH_LIMIT = 2;

function isAutoPublishEnabled() {
    return String(process.env.AI_AUTO_PUBLISH || "false").toLowerCase() === "true";
}

function validateAutoPublishItem(item) {
    const problems = [];

    if (!item?.title?.trim()) problems.push("missing title");
    if (!item?.body?.trim() || item.body.trim().length < 300) problems.push("body is missing or too short");
    if (!item?.category?.trim()) problems.push("missing category");
    if (!item?.social_caption?.trim()) problems.push("missing social caption");
    if (!item?.image_prompt?.trim()) problems.push("missing image prompt");
    if (!item?.scheduled_date) problems.push("missing scheduled date");

    return problems;
}

export async function autoPublishDueAIContent() {
    if (!isAutoPublishEnabled()) {
        console.log("AI auto-publish is disabled.");
        return [];
    }

    const today = new Date().toISOString().slice(0, 10);

    const { data: items, error } = await supabase
        .from("ai_content_queue")
        .select("*")
        .eq("status", "pending")
        .lte("scheduled_date", today)
        .order("scheduled_date", { ascending: true })
        .limit(AUTO_PUBLISH_LIMIT);

    if (error) {
        console.error("AI auto-publish queue load error:", error);
        return [];
    }

    const published = [];

    for (const item of items || []) {
        const problems = validateAutoPublishItem(item);

        if (problems.length) {
            console.warn(
                `AI auto-publish skipped: ${item.title || item.id}`,
                problems
            );
            continue;
        }

        try {
            // Auto-approval is recorded before publication so the normal
            // publisher service remains the single publishing path.
            const { error: approveError } = await supabase
                .from("ai_content_queue")
                .update({ status: "approved" })
                .eq("id", item.id)
                .eq("status", "pending");

            if (approveError) {
                throw approveError;
            }

            const approvedItem = {
                ...item,
                status: "approved"
            };

            await publishAIContent(approvedItem);
            published.push(item.id);

            console.log(
                "AI AUTO-PUBLISHED:",
                item.title,
                item.scheduled_date
            );
        } catch (publishError) {
            console.error(
                `AI auto-publish failed: ${item.title || item.id}`,
                publishError
            );

            // Return the item to pending so the next scheduler run can retry.
            await supabase
                .from("ai_content_queue")
                .update({ status: "pending" })
                .eq("id", item.id);
        }
    }

    return published;
}

export default {
    autoPublishDueAIContent
};
