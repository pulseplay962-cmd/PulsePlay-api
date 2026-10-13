import { supabase } from "../lib/supabase.js";
import {
    isFacebookPublishingEnabled,
    publishToFacebook,
    markSocialPostPosted
} from "./facebookService.js";

export async function createSocialPost({
    newsId,
    platform = "facebook",
    postText = "",
    imageUrl = "",
    hashtags = [],
    scheduledAt = null
}) {
    try {
        console.log("Creating social queue post:", {
            newsId, platform, postText, hasImage: Boolean(imageUrl)
        });

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
            console.error("SOCIAL QUEUE INSERT ERROR:", error);
            throw error;
        }

        console.log("SOCIAL POST QUEUED:", data.id);

        if (platform === "facebook" && isFacebookPublishingEnabled() && newsId) {
            try {
                const { data: article, error: articleError } = await supabase
                    .from("news")
                    .select("slug, title, image")
                    .eq("id", newsId)
                    .maybeSingle();

                if (articleError) throw articleError;

                const articleUrl = article?.slug
                    ? `https://pulseplay.online/news/${article.slug}`
                    : "";

                // Prefer the queued image, then the article image. The Facebook
                // service supplies a branded fallback if neither is fetchable.
                const postImageUrl =
                    String(imageUrl || "").trim() ||
                    String(article?.image || "").trim();

                const result = await publishToFacebook({
                    message: postText,
                    link: articleUrl,
                    imageUrl: postImageUrl
                });

                await markSocialPostPosted({
                    socialQueueId: data.id,
                    facebookPostId: result.postId
                });

                console.log("FACEBOOK AUTO-PUBLISH COMPLETE:", {
                    socialQueueId: data.id,
                    newsId,
                    facebookPostId: result.postId,
                    attachedImage: Boolean(postImageUrl)
                });
            } catch (facebookError) {
                console.error("FACEBOOK AUTO-PUBLISH FAILED:", facebookError);
            }
        }

        return data;
    } catch (error) {
        console.error("SOCIAL QUEUE ERROR:", error);
        throw error;
    }
}
