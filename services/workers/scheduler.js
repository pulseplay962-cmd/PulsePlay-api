import { pollAndPublishTwitch } from "./twitchPoller.js";
import { processSocialQueueItem } from "./facebookPoster.js";
import { supabase } from "../../lib/supabase.js";
import { generateAndSaveWeeklyContent } from "../ai/contentService.js";
import { cleanupAIQueue } from "../ai/queueCleanupService.js";
import { autoPublishDueAIContent } from "../ai/autoPublishService.js";


// =====================================
// Process Pending Social Posts
// =====================================

async function processPendingSocialPosts(limit = 10) {

  const { data, error } = await supabase
    .from("social_queue")
    .select("*")
    .eq("status", "scheduled")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {

    console.error(
      "Failed fetching social queue:",
      error
    );

    return [];

  }


  const results = [];


  for (const item of data || []) {

    try {

      await processSocialQueueItem(item);

      results.push(item.id);

    } catch (err) {

      console.error(
        "Failed posting social item:",
        err
      );

    }

  }


  return results;

}


// =====================================
// Check Whether Upcoming AI Package Exists
// =====================================

async function weeklyPackageExists() {

  const today =
    new Date()
      .toISOString()
      .slice(0, 10);


  const { data, error } = await supabase
    .from("ai_content_queue")
    .select("id, scheduled_date, status")
    .gte("scheduled_date", today)
    .order("scheduled_date", { ascending: true })
    .limit(7);


  if (error) {

    console.error(
      "Failed checking AI weekly package:",
      error
    );

    throw error;

  }


  return (
    Array.isArray(data) &&
    data.length >= 7
  );

}


// =====================================
// Generate Weekly AI Content If Needed
// =====================================

async function processWeeklyAIContent() {

  console.log(
    "Checking AI weekly content package..."
  );


  try {

    const exists =
      await weeklyPackageExists();


    if (exists) {

      console.log(
        "AI weekly package already exists — skipping generation."
      );

      return;

    }


    console.log(
      "AI weekly package not found — generating new package..."
    );


    const posts =
      await generateAndSaveWeeklyContent();


    console.log(
      "AI weekly package generated successfully:",
      posts?.length || 0,
      "posts"
    );

  } catch (err) {

    console.error(
      "AI weekly content generation error:",
      err
    );

  }

}


// =====================================
// Automatic AI Approval + Publishing
// =====================================

async function processAutomaticAIPublishing() {

  try {

    const published =
      await autoPublishDueAIContent();

    console.log(
      "AI auto-publish processed:",
      published.length,
      "articles"
    );

  } catch (err) {

    console.error(
      "AI auto-publish error:",
      err
    );

  }

}


// =====================================
// Scheduler
// =====================================

export async function runOnce() {

  console.log(
    "================================="
  );

  console.log(
    "Scheduler run started"
  );

  console.log(
    "================================="
  );


  // =====================================
  // AI Queue Cleanup
  // =====================================

  try {

    await cleanupAIQueue();

  } catch (err) {

    console.error(
      "AI queue cleanup error:",
      err
    );

  }


  // =====================================
  // AI Weekly Content
  // =====================================

  await processWeeklyAIContent();


  // =====================================
  // AI Automatic Publishing
  // =====================================

  await processAutomaticAIPublishing();


  // =====================================
  // Twitch
  // =====================================

  const twitchChannel =
    process.env.TWITCH_CHANNEL ||
    "Veiltactician";


  try {

    await pollAndPublishTwitch(
      twitchChannel,
      5
    );

  } catch (err) {

    console.error(
      "Twitch poll error:",
      err
    );

  }


  // =====================================
  // Facebook
  // =====================================

  if (
    process.env.FB_PAGE_ID &&
    process.env.FB_PAGE_ACCESS_TOKEN
  ) {

    try {

      const posted =
        await processPendingSocialPosts(10);


      console.log(
        "Social posts processed:",
        posted.length
      );

    } catch (err) {

      console.error(
        "Social processing error:",
        err
      );

    }

  } else {

    console.log(
      "FB credentials not found — skipping social queue processing."
    );

  }


  console.log(
    "================================="
  );

  console.log(
    "Scheduler run complete"
  );

  console.log(
    "================================="
  );

}


export default {
  runOnce
};
