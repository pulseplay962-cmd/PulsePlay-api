import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ytdlp from "youtube-dl-exec";
import ffmpegPath from "ffmpeg-static";
import openai, { getAIMode } from "./openaiService.js";
import { supabase } from "../../lib/supabase.js";
import { fetchRecentVideos } from "../twitch.js";

const DEFAULT_CHANNEL = process.env.TWITCH_CHANNEL || "Veiltactician";
const TITLE_MODEL = process.env.PULSEAI_MODEL || "gpt-4.1-mini";

function clock(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}` : `${m}:${String(s).padStart(2,"0")}`;
}

async function generateClipTitles({ streamTitle, momentType, startSeconds, endSeconds, context = "" }) {
  if (getAIMode?.() !== "openai") {
    return {
      title: `${streamTitle || "Veiltactician Stream"} — ${momentType || "Highlight"}`,
      options: [],
      description: context || "A highlight from the Veiltactician livestream.",
      reason: "Development mode fallback."
    };
  }

  const prompt = [
    "You are the PulsePlay gaming content editor.",
    "Create accurate, energetic titles for a real Veiltactician livestream clip.",
    "Never invent gameplay details that were not provided. Avoid clickbait.",
    "Return JSON only.",
    `Stream title: ${streamTitle || "Unknown"}`,
    `Moment type: ${momentType || "gaming highlight"}`,
    `Time range: ${clock(startSeconds)} - ${clock(endSeconds)}`,
    `Context: ${context || "No additional context provided."}`,
    '{"title":"best title","title_options":["option 1","option 2","option 3"],"description":"short description","reason":"why this is a useful clip"}'
  ].join("\n");

  const response = await openai.chat.completions.create({
    model: TITLE_MODEL,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: "PulsePlay gaming editor. Energetic, modern, community-first, factual, never clickbait." },
      { role: "user", content: prompt }
    ]
  });

  let parsed = {};
  try { parsed = JSON.parse(response?.choices?.[0]?.message?.content || "{}"); } catch {}
  return {
    title: parsed.title || `${streamTitle || "Veiltactician Stream"} — ${momentType || "Highlight"}`,
    options: Array.isArray(parsed.title_options) ? parsed.title_options.slice(0,5) : [],
    description: parsed.description || "",
    reason: parsed.reason || ""
  };
}

export async function syncRecentStreamVods(channel = DEFAULT_CHANNEL, limit = 10) {
  const videos = await fetchRecentVideos(channel, limit);
  if (!videos.length) return [];
  const rows = videos.map(v => ({
    twitch_id: v.twitch_id,
    channel,
    title: v.title,
    description: v.description,
    url: v.url,
    thumbnail_url: v.thumbnail_url,
    created_at: v.created_at,
    published_at: v.published_at,
    duration: v.duration,
    view_count: v.view_count || 0,
    status: "discovered"
  }));
  const { data, error } = await supabase.from("ai_stream_vods").upsert(rows, { onConflict: "twitch_id" }).select();
  if (error) throw error;
  return data || [];
}

export async function listStreamVods(limit = 20) {
  const { data, error } = await supabase.from("ai_stream_vods").select("*").order("published_at", { ascending:false }).limit(limit);
  if (error) throw error;
  return data || [];
}

export async function createClipCandidate({ vodId, startSeconds, endSeconds, momentType="highlight", context="", score=0 }) {
  const { data: vod, error: vodError } = await supabase.from("ai_stream_vods").select("*").eq("id", vodId).single();
  if (vodError || !vod) throw new Error("Stream VOD not found.");

  const start = Math.max(0, Math.floor(Number(startSeconds)));
  const end = Math.floor(Number(endSeconds));
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error("Clip start/end times are invalid.");
  if (end - start > 180) throw new Error("Clips are limited to 180 seconds.");

  const titles = await generateClipTitles({ streamTitle: vod.title, momentType, startSeconds:start, endSeconds:end, context });
  const { data, error } = await supabase.from("ai_stream_clips").insert({
    vod_id: vod.id, twitch_id: vod.twitch_id, title: titles.title, description: titles.description,
    platform:"youtube", start_seconds:start, end_seconds:end, score:Number(score)||0,
    moment_type:momentType, ai_reason:titles.reason, ai_title_options:titles.options,
    source_url:vod.url, thumbnail_url:vod.thumbnail_url, status:"candidate"
  }).select().single();
  if (error) throw error;
  return data;
}

async function downloadClip(sourceUrl, startSeconds, endSeconds, outputFile) {
  if (!ffmpegPath) throw new Error("FFmpeg is not available in this deployment.");
  await ytdlp(sourceUrl, {
    output: outputFile,
    format: "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b",
    mergeOutputFormat:"mp4",
    downloadSections:`*${startSeconds}-${endSeconds}`,
    forceKeyframesAtCuts:true,
    ffmpegLocation:ffmpegPath,
    noPlaylist:true,
    quiet:true,
    noWarnings:true
  });
}

export async function renderClip(clipId) {
  const { data: clip, error } = await supabase.from("ai_stream_clips").select("*, ai_stream_vods(*)").eq("id", clipId).single();
  if (error || !clip) throw new Error("Clip candidate not found.");
  if (!clip.source_url) throw new Error("The VOD does not have a source URL.");

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(),"pulseplay-clip-"));
  const outputFile = path.join(tempDir,`${clipId}.mp4`);
  const bucket = process.env.AI_MEDIA_BUCKET || "ai-media";

  try {
    await supabase.from("ai_stream_clips").update({status:"rendering",error:null}).eq("id",clipId);
    await downloadClip(clip.source_url,clip.start_seconds,clip.end_seconds,outputFile);
    const buffer = await fs.readFile(outputFile);
    const storagePath = `ai-stream-clips/${new Date().getUTCFullYear()}/${clipId}.mp4`;
    const upload = await supabase.storage.from(bucket).upload(storagePath,buffer,{contentType:"video/mp4",upsert:true});
    if (upload.error) throw upload.error;
    const clipUrl = supabase.storage.from(bucket).getPublicUrl(storagePath)?.data?.publicUrl || null;
    const { data: updated, error:updateError } = await supabase.from("ai_stream_clips").update({clip_url:clipUrl,status:"ready",error:null}).eq("id",clipId).select().single();
    if (updateError) throw updateError;
    return updated;
  } catch (err) {
    await supabase.from("ai_stream_clips").update({status:"failed",error:err.message || "Clip rendering failed."}).eq("id",clipId);
    throw err;
  } finally {
    await fs.rm(tempDir,{recursive:true,force:true}).catch(()=>{});
  }
}

export async function listClips(vodId=null, limit=50) {
  let query = supabase.from("ai_stream_clips").select("*, ai_stream_vods(title,url,thumbnail_url)").order("created_at",{ascending:false}).limit(limit);
  if (vodId) query = query.eq("vod_id",vodId);
  const { data,error } = await query;
  if (error) throw error;
  return data || [];
}
