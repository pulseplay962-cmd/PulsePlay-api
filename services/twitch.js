import fetch from "node-fetch";
import { supabase } from "../lib/supabase.js";

let cachedToken = null;
let tokenExpiresAt = 0;

async function getAppToken() {
  const clientId = process.env.TWITCH_CLIENT_ID?.trim();
  const clientSecret = process.env.TWITCH_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    throw new Error("Missing TWITCH_CLIENT_ID or TWITCH_CLIENT_SECRET in environment")
  }

  if (cachedToken && Date.now() < tokenExpiresAt - 60000) {
    return cachedToken;
  }

  const url = `https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`;

  const res = await fetch(url, { method: "POST" });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Failed to get Twitch token: ${res.status} ${txt}`);
  }

  const json = await res.json();

  cachedToken = json.access_token;
  tokenExpiresAt = Date.now() + (json.expires_in || 3600) * 1000;

  return cachedToken;

}

async function apiGet(path, params = {}) {
  const token = await getAppToken();

  const clientId = process.env.TWITCH_CLIENT_ID?.trim();

  const url = new URL(`https://api.twitch.tv/helix/${path}`);

  Object.keys(params).forEach(k => url.searchParams.append(k, params[k]));

  const res = await fetch(url.toString(), {
    headers: {
      "Client-Id": clientId,
      "Authorization": `Bearer ${token}`
    }
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Twitch API error ${res.status}: ${txt}`);
  }

  return res.json();

}

export async function getStreamStatus(channel) {

  try {
    const userResp = await apiGet("users", { login: channel });

    const user = (userResp.data && userResp.data[0]) || null;

    if (!user) {
      return { channel, live: false, message: "User not found" };
    }

    const liveResp = await apiGet("streams", { user_id: user.id });

    const live = (liveResp.data && liveResp.data.length > 0) || false;

    return {
      channel,
      live,
      user,
      stream: live ? liveResp.data[0] : null
    };

  } catch (error) {
    return {
      channel,
      live: false,
      error: error.message
    };
  }

}

export async function fetchRecentVideos(channel, limit = 10) {

  const userResp = await apiGet("users", { login: channel });

  const user = (userResp.data && userResp.data[0]) || null;

  if (!user) {
    throw new Error("Twitch user not found");
  }

  const videosResp = await apiGet("videos", { user_id: user.id, first: String(limit) });

  const videos = (videosResp.data || []).map(v => ({
    twitch_id: v.id,
    user_id: v.user_id,
    user_login: v.user_login,
    title: v.title,
    description: v.description,
    url: v.url,
    thumbnail_url: v.thumbnail_url,
    created_at: v.created_at,
    published_at: v.published_at || v.created_at,
    duration: v.duration,
    view_count: v.view_count || 0,
    language: v.language || null
  }));

  return videos;

}

export async function saveVideosToDB(videos = []) {

  if (!Array.isArray(videos) || videos.length === 0) return [];

  // Build upsert payload but adapt to existing table columns to avoid schema errors
  const table = "videos";

  // Try to fetch column names from information_schema
  let columns = null;

  try {
    const { data: cols, error: colsErr } = await supabase
      .from("information_schema.columns")
      .select("column_name")
      .eq("table_schema", "public")
      .eq("table_name", table);

    if (!colsErr && Array.isArray(cols) && cols.length > 0) {
      columns = cols.map(c => c.column_name);
    }
  } catch (err) {
    console.warn("Could not fetch table columns, falling back to full payload", err.message || err);
  }

  const upsertsAll = videos.map(v => ({
    twitch_id: v.twitch_id,
    title: v.title,
    url: v.url
  }));

  const upserts = (columns && columns.length > 0)
    ? upsertsAll.map(item => Object.fromEntries(Object.entries(item).filter(([k]) => columns.includes(k))))
    : upsertsAll;

  // If twitch_id is not a unique constraint, use insert-if-new flow
  const { data, error } = await supabase
    .from(table)
    .insert(upserts)
    .select();

  if (error) {
    console.error("Failed saving videos:", error);
    throw error;
  }

  return data;

}

export default {
  getStreamStatus,
  fetchRecentVideos,
  saveVideosToDB
};

