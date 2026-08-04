import { createProduct } from "./printful.js";
import { generateImage } from "../ai/imageService.js";
import { supabase } from "../../lib/supabase.js";

export async function createAIPrintfulMerch({
  name,
  description,
  category,
  price,
  prompt,
  sku,
}) {
  if (!name) {
    throw new Error("Merchandise name is required.");
  }

  const designPrompt =
    prompt ||
    `Create a bold PulsePlay merchandise design for a gaming audience using neon purple, cyan, and black. The artwork should feel futuristic, energetic, and suitable for apparel.`;

  const imageUrl = await generateImage(designPrompt);

  // Try to create a Printful product only when API key and variant ID are provided.
  let printfulProduct = null;
  let productUrl = "";

  const variantIdEnv = process.env.PRINTFUL_DEFAULT_VARIANT_ID || process.env.PRINTFUL_VARIANT_ID;
  const hasPrintfulKey = Boolean(process.env.PRINTFUL_API_KEY && process.env.PRINTFUL_API_KEY.trim());
  const variantId = variantIdEnv ? Number(variantIdEnv) : NaN;

  if (hasPrintfulKey && variantId && !Number.isNaN(variantId)) {
    try {
      const printfulResponse = await createProduct({
        sync_product: {
          name,
          thumbnail_url: imageUrl,
          external_id: `pulseplay-pod-${Date.now()}`,
        },
        sync_variants: [
          {
            variant_id: variantId,
            retail_price: String(price || "29.99"),
          },
        ],
      });

      printfulProduct = printfulResponse?.result || printfulResponse?.sync_product || printfulResponse;

      productUrl =
        printfulProduct?.external_url ||
        (printfulProduct?.id
          ? `https://www.printful.com/dashboard/products/${printfulProduct.id}`
          : "");
    } catch (err) {
      console.error("Printful createProduct failed, skipping Printful step:", err);
      // proceed without failing the whole operation
      printfulProduct = null;
      productUrl = "";
    }
  } else {
    console.log("PRINTFUL_API_KEY or PRINTFUL_DEFAULT_VARIANT_ID not set; skipping Printful product creation.");
  }

  const { data, error } = await supabase
    .from("merchandise")
    .insert({
      name,
      description,
      category: category || "Gaming Apparel",
      collection: "PulsePlay POD",
      price: Number(price || 29.99),
      sku: sku || `PP-POD-${Date.now()}`,
      supplier: "Printful",
      product_url: productUrl,
      image_url: imageUrl,
      status: "active",
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return {
    merchandise: data,
    printful: printfulProduct,
  };
}
