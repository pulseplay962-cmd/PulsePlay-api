import fetch from "node-fetch";
import { supabase } from "../../lib/supabase.js";

async function postToFacebook(pageId, pageAccessToken, message, link = null, imageUrl = null) {

  const url = `https://graph.facebook.com/${pageId}/feed`;

  const body = {
    message
  };

  if (link) body.link = link;

  const res = await fetch(url + `?access_token=${encodeURIComponent(pageAccessToken)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const json = await res.json();

  if (!res.ok) {
    throw new Error(`Facebook API error: ${JSON.stringify(json)}`);
  }

  return json;

}

export async function processSocialQueueItem(item) {

  const pageId = process.env.FB_PAGE_ID?.trim();
  const pageToken = process.env.FB_PAGE_ACCESS_TOKEN?.trim();

  if (!pageId || !pageToken) {
    throw new Error("Missing FB_PAGE_ID or FB_PAGE_ACCESS_TOKEN env vars");
  }

  const message = item.post_text || "";
  const link = item.link || null;

  const result = await postToFacebook(pageId, pageToken, message, link, item.image_url || null);

  // update queue status
  await supabase
    .from("social_queue")
    .update({ status: "posted", posted_response: result, posted_at: new Date().toISOString() })
    .eq("id", item.id);

  return result;

}

export default { processSocialQueueItem };
