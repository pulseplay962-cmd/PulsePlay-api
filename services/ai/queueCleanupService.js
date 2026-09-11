import { supabase } from "../../lib/supabase.js";

// =====================================
// AI Queue Cleanup Settings
// =====================================

const draftRetentionDays =
    Number(process.env.AI_DRAFT_RETENTION_DAYS || 30);

const failedRetentionDays =
    Number(process.env.AI_FAILED_RETENTION_DAYS || 7);

const publishedRetentionDays =
    Number(process.env.AI_PUBLISHED_QUEUE_RETENTION_DAYS || 7);


// =====================================
// Calculate Cutoff Date
// =====================================

function cutoffDate(days) {

    const date = new Date();

    date.setDate(
        date.getDate() - days
    );

    return date.toISOString();

}


// =====================================
// Cleanup AI Queue
// =====================================

export async function cleanupAIQueue() {

    console.log(
        "================================="
    );

    console.log(
        "AI QUEUE CLEANUP"
    );

    console.log(
        "================================="
    );


    let totalDeleted = 0;


    // =====================================
    // Remove Old Pending / Approved Content
    // =====================================

    const draftCutoff =
        cutoffDate(
            draftRetentionDays
        );

    const scheduledCutoff =
        new Date();

    scheduledCutoff.setDate(
        scheduledCutoff.getDate() -
        draftRetentionDays
    );

    const scheduledCutoffDate =
        scheduledCutoff
            .toISOString()
            .slice(0, 10);


    const {
        data: oldDrafts,
        error: draftError
    } = await supabase

        .from("ai_content_queue")

        .delete()

        .in(
            "status",
            [
                "pending",
                "approved"
            ]
        )

        .lt(
            "created_at",
            draftCutoff
        )
        .lt(
            "scheduled_date",
            scheduledCutoffDate
        )

        .select("id");


    if (draftError) {

        console.error(
            "AI draft cleanup error:",
            draftError
        );

    } else {

        const count =
            oldDrafts?.length || 0;

        totalDeleted += count;

        console.log(
            `Old pending/approved AI queue items removed: ${count}`
        );

    }


    // =====================================
    // Remove Old Failed / Rejected Content
    // =====================================

    const failedCutoff =
        cutoffDate(
            failedRetentionDays
        );


    const {
        data: oldFailed,
        error: failedError
    } = await supabase

        .from("ai_content_queue")

        .delete()

        .in(
            "status",
            [
                "failed",
                "rejected"
            ]
        )

        .lt(
            "created_at",
            failedCutoff
        )

        .select("id");


    if (failedError) {

        console.error(
            "AI failed/rejected cleanup error:",
            failedError
        );

    } else {

        const count =
            oldFailed?.length || 0;

        totalDeleted += count;

        console.log(
            `Old failed/rejected AI queue items removed: ${count}`
        );

    }


    // =====================================
    // Remove Old Published Queue Records
    // =====================================

    const publishedCutoff =
        cutoffDate(
            publishedRetentionDays
        );


    const {
        data: oldPublished,
        error: publishedError
    } = await supabase

        .from("ai_content_queue")

        .delete()

        .eq(
            "status",
            "published"
        )

        .lt(
            "published_at",
            publishedCutoff
        )

        .select("id");


    if (publishedError) {

        console.error(
            "AI published queue cleanup error:",
            publishedError
        );

    } else {

        const count =
            oldPublished?.length || 0;

        totalDeleted += count;

        console.log(
            `Old published AI queue records removed: ${count}`
        );

    }


    console.log(
        `AI queue cleanup complete. Total removed: ${totalDeleted}`
    );


    return totalDeleted;

}


export default {
    cleanupAIQueue
};
