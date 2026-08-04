import { fetchRecentVideos, saveVideosToDB } from "../twitch.js";
import { supabase } from "../../lib/supabase.js";
import { createSocialPost } from "../socialQueue.js";

function createSlug(text = ""){
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function pollAndPublishTwitch(channel, limit = 5) {
  console.log(`Polling Twitch for channel=${channel} limit=${limit}`);

  const videos = await fetchRecentVideos(channel, limit);

  if (!videos || videos.length === 0) return [];

  // Save to videos table (upsert)
  try {
    await saveVideosToDB(videos);
  } catch (err) {
    console.error("Failed saving videos:", err);
    // continue — don't fail the entire poll if videos table cannot be written
  }

  const published = [];

  const autoPublish = process.env.AUTO_PUBLISH === "true";

  for (const v of videos) {

    try {
      // avoid duplicates: look for news that contains the video url
      const { data: existing, error: existErr } = await supabase
        .from("news")
        .select("id")
        .ilike("content", `%${v.url}%`)
        .limit(1);

      if (existErr) {
        console.error("Failed checking existing news:", existErr);
      }

      if (existing && existing.length > 0) {
        // already published
        continue;
      }

      const slug = createSlug(v.title || `twitch-${v.twitch_id}`) || `twitch-${v.twitch_id}`;

      const articlePayload = {
        title: v.title,
        slug,
        excerpt: (v.description || "").substring(0, 160),
        content: `<p>${(v.description || "").replace(/\n/g, "<br />")}</p><p>Watch on Twitch: <a href="${v.url}">${v.url}</a></p>`,
        image: v.thumbnail_url || "",
        category: "Videos",
        featured: false,
        published: !!autoPublish,
        author: "PulsePlay Twitch",
        meta_description: (v.description || "").substring(0, 160),
        facebook_post: `New video: ${v.title} ${v.url}`,
        image_prompt: "",
        hashtags: [],
        published_at: autoPublish ? new Date().toISOString() : null
      };

      if (autoPublish) {
        const { data: inserted, error: insertErr } = await supabase
          .from("news")
          .insert(articlePayload)
          .select()
          .single();

        if (insertErr) {
          console.error("Failed inserting video article:", insertErr);
          continue;
        }

        // Create social queue post for Facebook
        try {
          const social = await createSocialPost({
            newsId: inserted.id,
            platform: "facebook",
            postText: articlePayload.facebook_post,
            imageUrl: articlePayload.image,
            hashtags: articlePayload.hashtags || [],
            scheduledAt: null
          });

          published.push({ article: inserted, social });

        } catch (err) {
          console.error("Failed creating social post for video:", err);
        }

      } else {
        // enqueue into ai_content_queue for manual review
        try {
          const queueItem = {
            title: articlePayload.title,
            content_type: "video",
            category: articlePayload.category,
            body: articlePayload.content,
            social_caption: articlePayload.facebook_post,
            image_prompt: articlePayload.image_prompt,
            scheduled_date: new Date().toISOString(),
            status: "pending"
          };

          const { data: queued, error: queueErr } = await supabase
            .from("ai_content_queue")
            .insert(queueItem)
            .select()
            .single();

          if (queueErr) {
            console.error("Failed enqueuing video:", queueErr);
            continue;
          }

          published.push({ queued });

        } catch (err) {
          console.error("Failed creating queue item:", err);
        }

      }

    } catch (error) {
      console.error("Error processing video:", error);
    }

  }

  console.log(`Twitch poll complete: published=${published.length}`);

  return published;

}

export default { pollAndPublishTwitch };
