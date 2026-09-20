import { supabase } from "../lib/supabase.js";
import {
    isFacebookPublishingEnabled,
    publishToFacebook,
    markSocialPostPosted
} from "./facebookService.js";

// =====================================
// Create Social Queue Post
// =====================================

export async function createSocialPost({
    newsId,
    platform = "facebook",
    postText = "",
    imageUrl = "",
    hashtags = [],
    scheduledAt = null
}) {
    try {
        console.log(
            "Creating social queue post:",
            {
                newsId,
                platform,
                postText
            }
        );

        const { data, error } = await supabase
            .from("social_queue")
            .insert({
                news_id: newsId,
                platform,
                post_text: postText,
                image_url: imageUrl,
                hashtags,
                status: "scheduled",
                scheduled_at: scheduledAt
            })
            .select()
            .single();

        if (error) {
            console.error(
                "SOCIAL QUEUE INSERT ERROR:",
                error
            );

            throw error;
        }

        console.log(
            "SOCIAL POST QUEUED:",
            data.id
        );

        /*
         * Facebook is published immediately when the direct
         * Meta integration is configured. The social_queue row
         * remains our record of the publication.
         *
         * The article URL is generated from the published news
         * record so Facebook visitors land directly on PulsePlay.
         */
        if (
            platform === "facebook" &&
            isFacebookPublishingEnabled() &&
            newsId
        ) {
            try {
                const { data:article, error:articleError } = await supabase
                    .from("news")
                    .select("slug, title")
                    .eq("id", newsId)
                    .maybeSingle();

                if (articleError) {
                    throw articleError;
                }

                const articleUrl = article?.slug
                    ? `https://pulseplay.online/news/${article.slug}`
                    : "";

                const result = await publishToFacebook({
                    message: postText,
                    link: articleUrl
                });

                await markSocialPostPosted({
                    socialQueueId: data.id,
                    facebookPostId: result.postId
                });

                console.log(
                    "FACEBOOK AUTO-PUBLISH COMPLETE:",
                    {
                        socialQueueId: data.id,
                        newsId,
                        facebookPostId: result.postId
                    }
                );
            } catch (facebookError) {
                /*
                 * Keep the queue record as scheduled so a future
                 * retry worker can publish it without losing the
                 * original social content.
                 */
                console.error(
                    "FACEBOOK AUTO-PUBLISH FAILED:",
                    facebookError
                );
            }
        }

        return data;
    } catch (error) {
        console.error(
            "SOCIAL QUEUE ERROR:",
            error
        );

        throw error;
    }
}
