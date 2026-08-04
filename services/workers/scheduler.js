import { pollAndPublishTwitch } from "./twitchPoller.js";
import { processSocialQueueItem } from "./facebookPoster.js";
import { supabase } from "../../lib/supabase.js";

async function processPendingSocialPosts(limit = 10) {
  const { data, error } = await supabase
    .from("social_queue")
    .select("*")
    .eq("status", "scheduled")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) {
    console.error("Failed fetching social queue:", error);
    return [];
  }

  const results = [];

  for (const item of data || []) {
    try {
      await processSocialQueueItem(item);
      results.push(item.id);
    } catch (err) {
      console.error("Failed posting social item:", err);
    }
  }

  return results;
}

export async function runOnce() {
  console.log("Scheduler run started");

  const twitchChannel = process.env.TWITCH_CHANNEL || "Veiltactician";

  try {
    await pollAndPublishTwitch(twitchChannel, 5);
  } catch (err) {
    console.error("Twitch poll error:", err);
  }

  if (process.env.FB_PAGE_ID && process.env.FB_PAGE_ACCESS_TOKEN) {
    try {
      const posted = await processPendingSocialPosts(10);
      console.log("Social posts processed:", posted.length);
    } catch (err) {
      console.error("Social processing error:", err);
    }
  } else {
    console.log("FB credentials not found — skipping social queue processing.");
  }

  console.log("Scheduler run complete");

}

export default { runOnce };
