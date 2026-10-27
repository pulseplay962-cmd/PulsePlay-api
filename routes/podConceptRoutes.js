import express from "express";
import { randomUUID } from "node:crypto";
import { supabase } from "../lib/supabase.js";
import { requireAdmin } from "../middleware/adminAuth.js";

const router = express.Router();
const BUCKET = "pod-design-concepts";
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const SIGNED_URL_SECONDS = 60;
const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);

function fail(res, status, error) {
  return res.status(status).json({ success: false, error });
}

function parseArtwork(dataUrl) {
  if (typeof dataUrl !== "string") return null;
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\r\n]+)$/.exec(dataUrl);
  if (!match || !ALLOWED_MIME.has(match[1])) return null;
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) return null;
  return { mimeType: match[1], buffer };
}

async function signedConcept(concept) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(concept.artwork_path, SIGNED_URL_SECONDS);
  if (error) throw error;
  return { ...concept, artwork_url: data.signedUrl };
}

router.use(requireAdmin);

router.get("/", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("pod_design_concepts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    const concepts = await Promise.all((data || []).map(signedConcept));
    return res.json({ success: true, concepts });
  } catch (error) {
    console.error("POD concepts list failed:", error);
    return fail(res, 500, "Could not load saved concepts. Verify the migration and private storage bucket are configured.");
  }
});

router.post("/", async (req, res) => {
  const { title, prompt, mode = "new", product_name = null, imageDataUrl } = req.body || {};
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 4000) {
    return fail(res, 400, "A prompt of 1–4,000 characters is required.");
  }
  if (typeof title !== "string" || !title.trim() || title.trim().length > 160) {
    return fail(res, 400, "A title of 1–160 characters is required.");
  }
  if (!["new", "improve"].includes(mode)) return fail(res, 400, "Invalid concept mode.");
  if (product_name !== null && (typeof product_name !== "string" || product_name.length > 200)) {
    return fail(res, 400, "Product name must be 200 characters or fewer.");
  }
  const artwork = parseArtwork(imageDataUrl);
  if (!artwork) return fail(res, 400, "Artwork must be a valid PNG, JPEG, or WebP image no larger than 10 MB.");

  const extension = ({ "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" })[artwork.mimeType];
  const id = randomUUID();
  const path = `${req.user.id}/${id}.${extension}`;
  let uploaded = false;
  try {
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, artwork.buffer, { contentType: artwork.mimeType, upsert: false });
    if (uploadError) throw uploadError;
    uploaded = true;

    const { data: concept, error: insertError } = await supabase
      .from("pod_design_concepts")
      .insert({
        id, title: title.trim(), prompt: prompt.trim(), mode,
        product_name: product_name?.trim() || null,
        status: "draft", artwork_path: path, created_by: req.user.id
      })
      .select("*")
      .single();
    if (insertError) throw insertError;

    const { error: eventError } = await supabase.from("pod_design_concept_events").insert({
      concept_id: id, actor_id: req.user.id, event_type: "created",
      previous_status: null, new_status: "draft"
    });
    if (eventError) {
      // Roll back the concept and artwork if its required audit record failed.
      await supabase.from("pod_design_concepts").delete().eq("id", id);
      throw eventError;
    }

    return res.status(201).json({ success: true, concept: await signedConcept(concept) });
  } catch (error) {
    console.error("POD concept save failed:", error);
    if (uploaded) await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
    return fail(res, 500, "Could not save the concept. Verify the database migration, private bucket, and server storage permissions.");
  }
});

router.patch("/:id/status", async (req, res) => {
  const { status } = req.body || {};
  if (!["approved", "rejected"].includes(status)) {
    return fail(res, 400, "Status must be approved or rejected.");
  }
  const { id } = req.params;
  try {
    const { data: current, error: readError } = await supabase
      .from("pod_design_concepts").select("*").eq("id", id).maybeSingle();
    if (readError) throw readError;
    if (!current) return fail(res, 404, "Concept not found.");
    if (current.status === status) return res.json({ success: true, concept: await signedConcept(current) });

    const { data: updated, error: updateError } = await supabase
      .from("pod_design_concepts")
      .update({
        status,
        decision_by: req.user.id,
        decision_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("id", id)
      .select("*")
      .single();
    if (updateError) throw updateError;

    const { error: eventError } = await supabase.from("pod_design_concept_events").insert({
      concept_id: id, actor_id: req.user.id, event_type: status,
      previous_status: current.status, new_status: status
    });
    if (eventError) {
      // Avoid reporting a successful decision if its audit event could not be saved.
      await supabase.from("pod_design_concepts").update({
        status: current.status, decision_by: current.decision_by,
        decision_at: current.decision_at, updated_at: current.updated_at
      }).eq("id", id);
      throw eventError;
    }
    return res.json({ success: true, concept: await signedConcept(updated) });
  } catch (error) {
    console.error("POD concept status update failed:", error);
    return fail(res, 500, "Could not save the decision and its audit record.");
  }
});

export default router;
