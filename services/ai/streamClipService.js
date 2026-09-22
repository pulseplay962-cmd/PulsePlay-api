import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import ytdlp from "youtube-dl-exec";
import ffmpegStaticPath from "ffmpeg-static";
import openai, { getAIMode, isAIProductionMode } from "./openaiService.js";
import { supabase } from "../../lib/supabase.js";
import { fetchRecentVideos } from "../twitch.js";

const execFileAsync = promisify(execFile);

const DEFAULT_CHANNEL = process.env.TWITCH_CHANNEL || "Veiltactician";
const TITLE_MODEL = process.env.PULSEAI_MODEL || "gpt-4.1-mini";
const ffmpegPath = process.env.FFMPEG_PATH || (process.platform === "linux" ? "/usr/bin/ffmpeg" : ffmpegStaticPath);

function clock(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}` : `${m}:${String(s).padStart(2,"0")}`;
}

async function generateClipTitles({ streamTitle, momentType, startSeconds, endSeconds, context = "" }) {
  if (!isAIProductionMode()) {
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

  const startedAt = Date.now();
  const duration = Math.max(1, Number(endSeconds) - Number(startSeconds));

  console.log("AI clip download starting:", {
    startSeconds,
    endSeconds,
    duration,
    sourceUrl
  });

  // Render free instances have very limited memory. Keep this path deliberately
  // lightweight: use a single progressive MP4 stream, one fragment at a time,
  // and let yt-dlp perform the section cut without forcing keyframes. The
  // previous forceKeyframesAtCuts path could make ffmpeg consume enough memory
  // to have the Render free worker restarted before the promise resolved.
  try {
    await ytdlp(sourceUrl, {
      output: outputFile,
      format: "worst[ext=mp4]/worst",
      downloadSections: `*${startSeconds}-${endSeconds}`,
      ffmpegLocation: ffmpegPath,
      noPlaylist: true,
      quiet: true,
      noWarnings: true,
      concurrentFragments: 1,
      retries: 1,
      fragmentRetries: 1,
      socketTimeout: 30
    });

    const stat = await fs.stat(outputFile);
    console.log("AI clip download completed:", {
      bytes: stat.size,
      elapsedMs: Date.now() - startedAt
    });
  } catch (error) {
    console.error("AI clip download failed:", {
      elapsedMs: Date.now() - startedAt,
      error: error?.message || "Unknown yt-dlp error"
    });
    throw error;
  }
}

export async function renderClip(clipId, db = supabase) {
  const { data: clip, error } = await db.from("ai_stream_clips").select("*, ai_stream_vods(*)").eq("id", clipId).single();
  if (error || !clip) throw new Error("Clip candidate not found.");
  if (!clip.source_url) throw new Error("The VOD does not have a source URL.");

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(),"pulseplay-clip-"));
  const outputFile = path.join(tempDir,`${clipId}.mp4`);
  const bucket = process.env.AI_MEDIA_BUCKET || "ai-media";

  try {
    await db.from("ai_stream_clips").update({status:"rendering",error:null}).eq("id",clipId);
    await downloadClip(clip.source_url,clip.start_seconds,clip.end_seconds,outputFile);
    const buffer = await fs.readFile(outputFile);
    const storagePath = `ai-stream-clips/${new Date().getUTCFullYear()}/${clipId}.mp4`;
    const upload = await db.storage.from(bucket).upload(storagePath,buffer,{contentType:"video/mp4",upsert:true});
    if (upload.error) throw upload.error;
    const clipUrl = db.storage.from(bucket).getPublicUrl(storagePath)?.data?.publicUrl || null;
    const { data: updated, error:updateError } = await db.from("ai_stream_clips").update({clip_url:clipUrl,status:"ready",error:null}).eq("id",clipId).select().single();
    if (updateError) throw updateError;
    return updated;
  } catch (err) {
    await db.from("ai_stream_clips").update({status:"failed",error:err.message || "Clip rendering failed."}).eq("id",clipId);
    throw err;
  } finally {
    await fs.rm(tempDir,{recursive:true,force:true}).catch(()=>{});
  }
}


export async function renderVerticalClip(clipId, db = supabase) {
  const { data: clip, error } = await db.from("ai_stream_clips").select("*").eq("id", clipId).single();
  if (error || !clip) throw new Error("Clip candidate not found.");
  if (!clip.clip_url) throw new Error("Render the master MP4 before creating the vertical version.");

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pulseplay-vertical-"));
  const inputFile = path.join(tempDir, clipId + "-master.mp4");
  const outputFile = path.join(tempDir, clipId + "-vertical.mp4");
  const bucket = process.env.AI_MEDIA_BUCKET || "ai-media";

  try {
    const response = await fetch(clip.clip_url);
    if (!response.ok) throw new Error("Unable to download master clip (HTTP " + response.status + ").");
    await fs.writeFile(inputFile, Buffer.from(await response.arrayBuffer()));
    await execFileAsync(ffmpegPath, ["-y", "-i", inputFile, "-vf", "scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,setsar=1", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", outputFile], { maxBuffer: 4194304 });
    const buffer = await fs.readFile(outputFile);
    const storagePath = "ai-stream-clips/vertical/" + new Date().getUTCFullYear() + "/" + clipId + ".mp4";
    const upload = await db.storage.from(bucket).upload(storagePath, buffer, { contentType: "video/mp4", upsert: true });
    if (upload.error) throw upload.error;
    const clipUrl = db.storage.from(bucket).getPublicUrl(storagePath)?.data?.publicUrl || null;
    const { data: updated, error: updateError } = await db.from("ai_stream_clips").update({ vertical_clip_url: clipUrl }).eq("id", clipId).select().single();
    if (updateError) throw updateError;
    return updated;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function renderCaptionedVerticalClip(clipId, captions = [], db = supabase) {
  const { data: clip, error } = await db.from("ai_stream_clips").select("*").eq("id", clipId).single();
  if (error || !clip) throw new Error("Clip candidate not found.");
  if (!clip.vertical_clip_url) throw new Error("Create the 9:16 vertical clip first.");
  if (!Array.isArray(captions) || !captions.length) throw new Error("No caption segments were supplied.");

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pulseplay-captioned-"));
  const inputFile = path.join(tempDir, clipId + "-vertical.mp4");
  const outputFile = path.join(tempDir, clipId + "-captioned.mp4");
  const srtFile = path.join(tempDir, clipId + ".srt");
  const bucket = process.env.AI_MEDIA_BUCKET || "ai-media";

  const srtTime = (seconds) => {
    const totalMs = Math.max(0, Math.round(Number(seconds || 0) * 1000));
    const h = Math.floor(totalMs / 3600000);
    const m = Math.floor((totalMs % 3600000) / 60000);
    const s = Math.floor((totalMs % 60000) / 1000);
    const ms = totalMs % 1000;
    return h + ":" + String(m).padStart(2,"0") + ":" + String(s).padStart(2,"0") + "," + String(ms).padStart(3,"0");
  };

  try {
    const response = await fetch(clip.vertical_clip_url);
    if (!response.ok) throw new Error("Unable to download vertical clip (HTTP " + response.status + ").");
    await fs.writeFile(inputFile, Buffer.from(await response.arrayBuffer()));

    const usable = captions
      .map((c) => ({ start: Number(c.start), end: Number(c.end), text: String(c.text || "").trim() }))
      .filter((c) => Number.isFinite(c.start) && Number.isFinite(c.end) && c.end > c.start && c.text)
      .slice(0, 250);

    const srt = usable.map((c, i) => (i + 1) + "\n" + srtTime(c.start) + " --> " + srtTime(c.end) + "\n" + c.text.replace(/\\r?\\n/g, " ") + "\n").join("\n");
    await fs.writeFile(srtFile, srt, "utf8");

    const filter = "subtitles=" + srtFile + ":force_style='FontName=Arial,FontSize=18,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=3,Outline=2,Shadow=1,Alignment=2,MarginV=80'";
    await execFileAsync(ffmpegPath, ["-y","-i",inputFile,"-vf",filter,"-c:v","libx264","-preset","veryfast","-crf","23","-c:a","aac","-b:a","128k","-movflags","+faststart",outputFile], { maxBuffer: 4194304 });

    const buffer = await fs.readFile(outputFile);
    const storagePath = "ai-stream-clips/captioned/" + new Date().getUTCFullYear() + "/" + clipId + ".mp4";
    const upload = await db.storage.from(bucket).upload(storagePath, buffer, { contentType:"video/mp4", upsert:true });
    if (upload.error) throw upload.error;
    const captionedUrl = db.storage.from(bucket).getPublicUrl(storagePath)?.data?.publicUrl || null;
    const { data: updated, error:updateError } = await db.from("ai_stream_clips").update({ captioned_vertical_clip_url: captionedUrl }).eq("id", clipId).select().single();
    if (updateError) throw updateError;
    return updated;
  } finally {
    await fs.rm(tempDir, { recursive:true, force:true }).catch(()=>{});
  }
}

function parseDuration(value) {
  if (value === null || value === undefined || value === "") return 0;

  const raw = String(value).trim();

  // Twitch VOD durations are commonly returned as strings such as:
  // "1h23m45s", "23m45s", or "45s".
  const twitch = raw.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
  if (twitch && twitch[0]) {
    const hours = Number(twitch[1] || 0);
    const minutes = Number(twitch[2] || 0);
    const seconds = Number(twitch[3] || 0);
    return (hours * 3600) + (minutes * 60) + seconds;
  }

  // Also accept HH:MM:SS / MM:SS formats for existing or manually stored VODs.
  const colon = raw.match(/^(?:(\d+):)?(\d+):(\d+)(?:\.(\d+))?$/);
  if (colon) {
    return (Number(colon[1] || 0) * 3600) + (Number(colon[2] || 0) * 60) + Number(colon[3] || 0);
  }

  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : 0;
}

async function downloadAudioPreview(sourceUrl, outputStem, durationSeconds) {
  if (!ffmpegPath) throw new Error("FFmpeg is not available in this deployment.");

  // Render's native Debian runtime includes system FFmpeg. Use it instead of
  // ffmpeg-static, whose bundled binary is crashing with SIGSEGV (-11) on the
  // free instance during Twitch VOD audio extraction.
  const analysisLimit = Math.min(Number(durationSeconds) || 0, 900);
  const outputTemplate = outputStem + ".%(ext)s";

  await ytdlp(sourceUrl, {
    output: outputTemplate,
    format: "worstaudio/worst",
    playlistItems: "1",
    noPlaylist: true,
    quiet: true,
    noWarnings: true,
    ffmpegLocation: ffmpegPath,
    downloadSections: "*0-" + analysisLimit
  });

  const files = await fs.readdir(path.dirname(outputStem));
  const prefix = path.basename(outputStem) + ".";
  const match = files.find(name => name.startsWith(prefix) && name !== path.basename(outputStem));
  if (!match) throw new Error("Audio download completed but no audio file was found.");
  return path.join(path.dirname(outputStem), match);
}

async function transcribeAudio(audioFile) {
  if (!isAIProductionMode() && !process.env.OPENAI_API_KEY) return [];
  const stream = await fs.open(audioFile, "r");
  await stream.close();
  const file = await import("node:fs").then(m => m.createReadStream(audioFile));
  const response = await openai.audio.transcriptions.create({
    file,
    model: process.env.PULSEAI_TRANSCRIPTION_MODEL || "whisper-1",
    response_format: "verbose_json",
    timestamp_granularities: ["segment"]
  });

  // OpenAI SDK versions can expose verbose transcription responses as either
  // an object or a JSON string. Normalize both shapes before analysis.
  let normalized = response;
  if (typeof response === "string") {
    try {
      normalized = JSON.parse(response);
    } catch {
      normalized = { text: response };
    }
  }

  let segments = Array.isArray(normalized?.segments) ? normalized.segments : [];
  const text = typeof normalized?.text === "string" ? normalized.text.trim() : "";

  console.log("AI transcription response:", {
    type: typeof response,
    keys: normalized && typeof normalized === "object" ? Object.keys(normalized) : [],
    textLength: text.length,
    segmentCount: segments.length
  });

  // Some OpenAI SDK/API response combinations return the transcript text
  // without the verbose segment array. Keep the workflow usable by treating
  // that transcript as one timestamped analysis window.
  if (!segments.length && text) {
    segments = [{
      start: 0,
      end: Math.min(900, Number(process.env.AI_CLIP_ANALYSIS_SECONDS) || 900),
      text
    }];
    console.log("AI transcription fallback: using full transcript text as one analysis segment.");
  }

  return segments;
}

async function detectMomentsFromTranscript({ vod, segments }) {
  if ((!isAIProductionMode() && !process.env.OPENAI_API_KEY) || !segments.length) return [];
  const transcript = segments
    .map(s => `[${clock(s.start)}-${clock(s.end)}] ${s.text || ""}`)
    .join("\n")
    .slice(0, 30000);

  const prompt = [
    "Find the strongest short-form gaming clip moments in this Veiltactician livestream transcript.",
    "Only select moments supported by the transcript. Do not invent gameplay.",
    "Prefer reactions, excitement, surprising moments, funny moments, combat intensity, story reactions, victories and memorable commentary.",
    "Return JSON only.",
    `Stream title: ${vod.title || "Unknown"}`,
    transcript,
    '{"moments":[{"start_seconds":0,"end_seconds":60,"moment_type":"highlight","score":92,"context":"brief factual reason"}]}'
  ].join("\n");

  const response = await openai.chat.completions.create({
    model: TITLE_MODEL,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: "You are a factual gaming highlight editor. Never fabricate events." },
      { role: "user", content: prompt }
    ]
  });

  let parsed = {};
  try { parsed = JSON.parse(response?.choices?.[0]?.message?.content || "{}"); } catch {}
  return (parsed.moments || [])
    .filter(m => Number.isFinite(Number(m.start_seconds)) && Number.isFinite(Number(m.end_seconds)))
    .map(m => ({
      startSeconds: Math.max(0, Math.floor(Number(m.start_seconds))),
      endSeconds: Math.floor(Number(m.end_seconds)),
      momentType: m.moment_type || "highlight",
      score: Math.max(0, Math.min(100, Number(m.score) || 0)),
      context: m.context || ""
    }))
    .filter(m => m.endSeconds > m.startSeconds && m.endSeconds - m.startSeconds <= 180)
    .sort((a,b) => b.score - a.score)
    .slice(0, Number(process.env.AI_CLIP_MAX_CANDIDATES) || 10);
}

export async function analyzeVodForClipCandidates(vodId) {
  const { data: vod, error } = await supabase.from("ai_stream_vods").select("*").eq("id", vodId).single();
  if (error || !vod) throw new Error("Stream VOD not found.");
  if (!vod.url) throw new Error("VOD has no source URL.");

  const duration = parseDuration(vod.duration);
  if (!duration) throw new Error("VOD duration is unavailable.");

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pulseplay-analysis-"));
  const audioStem = path.join(tempDir, `${vod.twitch_id}`);
  try {
    await supabase.from("ai_stream_vods").update({ status: "analyzing" }).eq("id", vodId);
    const audioFile = await downloadAudioPreview(vod.url, audioStem, duration);
    const segments = await transcribeAudio(audioFile);
    console.log(`AI VOD transcription complete: ${segments.length} segments for ${vod.twitch_id}`);
    const moments = await detectMomentsFromTranscript({ vod, segments });
    console.log(`AI VOD moment detection complete: ${moments.length} moments for ${vod.twitch_id}`);

    const created = [];
    const candidateErrors = [];
    for (const moment of moments) {
      try {
        created.push(await createClipCandidate({
          vodId,
          startSeconds: moment.startSeconds,
          endSeconds: moment.endSeconds,
          momentType: moment.momentType,
          context: moment.context,
          score: moment.score
        }));
      } catch (err) {
        console.error("AI clip candidate creation failed:", err);
        candidateErrors.push(err.message || "Unknown candidate creation error.");
      }
    }

    if (moments.length > 0 && created.length === 0) {
      throw new Error(`AI found ${moments.length} moments, but none could be saved as clip candidates. ${candidateErrors[0] || ""}`.trim());
    }

    await supabase.from("ai_stream_vods").update({ status: "analyzed", analyzed_at: new Date().toISOString() }).eq("id", vodId);
    return { vod, candidates: created, analyzedSegments: segments.length, detectedMoments: moments.length, candidateErrors };
  } catch (err) {
    await supabase.from("ai_stream_vods").update({ status: "analysis_failed" }).eq("id", vodId);
    throw err;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function autoRenderTopClips(vodId, limit = 3, authorization = "") {
  const maxClips = Math.min(Math.max(Number(limit) || 3, 1), 3);
  const workerUrl = process.env.CLIP_RENDER_WORKER_URL?.trim();
  const workerSecret = process.env.CLIP_RENDER_WORKER_SECRET?.trim();

  if (!workerUrl || !workerSecret) {
    throw new Error("AI clip render worker is not configured.");
  }

  if (!authorization.startsWith("Bearer ")) {
    throw new Error("Administrator authorization is required to start clip rendering.");
  }

  const staleBefore = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: staleRendering, error: staleError } = await supabase
    .from("ai_stream_clips")
    .select("id,updated_at")
    .eq("vod_id", vodId)
    .eq("status", "rendering")
    .lt("updated_at", staleBefore);

  if (staleError) throw staleError;

  if (staleRendering?.length) {
    const staleIds = staleRendering.map((clip) => clip.id);
    const { error: resetError } = await supabase
      .from("ai_stream_clips")
      .update({ status: "candidate", error: "Recovered from an interrupted render." })
      .in("id", staleIds);

    if (resetError) throw resetError;
    console.log("AI auto-render recovered stale clips:", staleIds.length);
  }

  const { data: clips, error } = await supabase
    .from("ai_stream_clips")
    .select("*")
    .eq("vod_id", vodId)
    .eq("status", "candidate")
    .order("score", { ascending: false })
    .limit(maxClips);

  if (error) throw error;

  const queued = [];
  const errors = [];

  for (const clip of clips || []) {
    try {
      const workerEndpoint = workerUrl.endsWith("/") ? workerUrl.slice(0, -1) : workerUrl;
      const response = await fetch(`${workerEndpoint}/render`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Clip-Worker-Secret": workerSecret,
        },
        body: JSON.stringify({ clipId: clip.id, authorization }),
      });

      const text = await response.text();
      let result = {};
      try { result = JSON.parse(text || "{}"); } catch {}

      if (!response.ok || !result.success) {
        throw new Error(result.error || `Render worker returned HTTP ${response.status}.`);
      }

      queued.push({ id: clip.id, queueLength: result.queueLength || 0 });
    } catch (err) {
      console.error("AI auto-render queue failed:", err);
      errors.push({ id: clip.id, error: err.message || "Unable to queue clip render." });
    }
  }

  console.log("AI auto-render queued:", {
    vodId,
    requested: maxClips,
    selected: clips?.length || 0,
    queued: queued.length,
    errors: errors.length,
  });

  return { queued, errors, selected: clips?.length || 0 };
}

export async function queueVerticalClipRender(clipId, authorization = "") {
  const workerUrl = process.env.CLIP_RENDER_WORKER_URL?.trim();
  const workerSecret = process.env.CLIP_RENDER_WORKER_SECRET?.trim();
  if (!workerUrl || !workerSecret) throw new Error("AI clip render worker is not configured.");
  if (!authorization.startsWith("Bearer ")) throw new Error("Administrator authorization is required to render clips.");
  const endpoint = workerUrl.endsWith("/") ? workerUrl.slice(0, -1) : workerUrl;
  const response = await fetch(endpoint + "/render-vertical", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Clip-Worker-Secret": workerSecret },
    body: JSON.stringify({ clipId })
  });
  const text = await response.text();
  let result = {};
  try { result = JSON.parse(text || "{}"); } catch {}
  if (!response.ok || !result.success) throw new Error(result.error || "Unable to queue vertical clip render.");
  return result;
}

export async function queueCaptionedVerticalClipRender(clipId, authorization = "") {
  const workerUrl = process.env.CLIP_RENDER_WORKER_URL?.trim();
  const workerSecret = process.env.CLIP_RENDER_WORKER_SECRET?.trim();
  if (!workerUrl || !workerSecret) throw new Error("AI clip render worker is not configured.");
  if (!authorization.startsWith("Bearer ")) throw new Error("Administrator authorization is required to render captions.");

  const { data: clip, error } = await supabase.from("ai_stream_clips").select("id,vertical_clip_url").eq("id", clipId).single();
  if (error || !clip) throw new Error("Clip candidate not found.");
  if (!clip.vertical_clip_url) throw new Error("Create the 9:16 vertical clip first.");

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pulseplay-caption-source-"));
  const audioFile = path.join(tempDir, clipId + ".mp4");
  try {
    const response = await fetch(clip.vertical_clip_url);
    if (!response.ok) throw new Error("Unable to download vertical clip for caption generation.");
    await fs.writeFile(audioFile, Buffer.from(await response.arrayBuffer()));
    if (!isAIProductionMode() && !process.env.OPENAI_API_KEY) throw new Error("OpenAI is not configured for caption generation.");

    const file = await import("node:fs").then(m => m.createReadStream(audioFile));
    const transcription = await openai.audio.transcriptions.create({
      file,
      model: process.env.PULSEAI_TRANSCRIPTION_MODEL || "whisper-1",
      response_format: "verbose_json",
      timestamp_granularities: ["segment"]
    });
    const segments = Array.isArray(transcription?.segments) ? transcription.segments : [];
    if (!segments.length) throw new Error("AI transcription returned no timestamped caption segments.");

    const captions = segments.map(s => ({ start:Number(s.start)||0, end:Number(s.end)||0, text:String(s.text||"").trim() })).filter(s => s.end > s.start && s.text).slice(0,250);
    const endpoint = workerUrl.endsWith("/") ? workerUrl.slice(0,-1) : workerUrl;
    const workerResponse = await fetch(endpoint + "/render-captioned-vertical", {
      method:"POST",
      headers:{"Content-Type":"application/json","X-Clip-Worker-Secret":workerSecret},
      body:JSON.stringify({clipId,captions})
    });
    const bodyText = await workerResponse.text();
    let result = {};
    try { result = JSON.parse(bodyText || "{}"); } catch {}
    if (!workerResponse.ok || !result.success) throw new Error(result.error || "Unable to queue captioned clip render.");
    return result;
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
