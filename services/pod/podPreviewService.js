import openai, { isAIProductionMode } from "../ai/openaiService.js";

const IMAGE_MODEL = "gpt-image-1-mini";

// Generates a temporary preview URL only. This function deliberately does not
// upload to storage, write to Supabase, or call Printful.
export async function generatePODDesignPreview(prompt) {
  if (typeof prompt !== "string" || !prompt.trim()) {
    throw new Error("A design prompt is required.");
  }
  if (prompt.length > 4000) {
    throw new Error("Keep the design prompt under 4,000 characters.");
  }

  if (!isAIProductionMode()) {
    const safeText = prompt.trim().slice(0, 90).replace(/[&<>"]/g, "");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="#070b14"/><rect x="45" y="45" width="934" height="934" rx="36" fill="#0d1324" stroke="#22d3ee" stroke-width="5"/><text x="512" y="390" text-anchor="middle" fill="#22d3ee" font-family="Arial" font-size="54" font-weight="bold">PULSEPLAY</text><text x="512" y="460" text-anchor="middle" fill="#a78bfa" font-family="Arial" font-size="28">DESIGN PREVIEW (DEVELOPMENT)</text><foreignObject x="100" y="530" width="824" height="220"><div xmlns="http://www.w3.org/1999/xhtml" style="color:#e2e8f0;font:22px Arial;text-align:center;overflow-wrap:anywhere">${safeText}</div></foreignObject></svg>`;
    return "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");
  }

  const response = await openai.images.generate({
    model: IMAGE_MODEL,
    prompt: prompt.trim(),
    size: "1024x1024",
    output_format: "png"
  });
  const base64 = response?.data?.[0]?.b64_json;
  if (!base64) throw new Error("Image service returned no preview image.");
  // Return a temporary data URL to the caller; no storage/database write.
  return "data:image/png;base64," + base64;
}
