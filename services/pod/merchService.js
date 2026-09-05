import { createProduct, listProducts, getProduct } from "./printful.js";
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
    `Create a bold PulsePlay merchandise design for a gaming audience using neon purple, cyan,and black. The artwork should feel futuristic, energetic, and suitable for apparel.`;

  const imageUrl = await generateImage(designPrompt);

  let printfulProduct = null;
  let productUrl = "";

  const variantIdEnv =
    process.env.PRINTFUL_DEFAULT_VARIANT_ID ||
    process.env.PRINTFUL_VARIANT_ID;

  const hasPrintfulKey = Boolean(
    process.env.PRINTFUL_API_KEY &&
      process.env.PRINTFUL_API_KEY.trim()
  );

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

      printfulProduct =
        printfulResponse?.result ||
        printfulResponse?.sync_product ||
        printfulResponse;

      productUrl =
        printfulProduct?.external_url ||
        (printfulProduct?.id
          ? `https://www.printful.com/dashboard/products/${printfulProduct.id}`
          : "");
    } catch (err) {
      console.error(
        "Printful createProduct failed, skipping Printful step:",
        err
      );

      printfulProduct = null;
      productUrl = "";
    }
  } else {
    console.log(
      "PRINTFUL_API_KEY or PRINTFUL_DEFAULT_VARIANT_ID not set; skipping Printful product creation."
    );
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

/**
 * Sync existing Printful store products into PulsePlay merchandise.
 *
 * IMPORTANT:
 * - This imports existing Printful products only.
 * - It never creates Printful products.
 * - It never deletes PulsePlay merchandise.
 * - Matching is performed by Printful sync product ID.
 */
export async function syncPrintfulMerchandise() {
  const listResponse = await listProducts();

  const products = Array.isArray(listResponse?.result)
    ? listResponse.result
    : [];

  if (products.length === 0) {
    return {
      success: true,
      total: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      products: [],
    };
  }

  const results = [];

  for (const product of products) {
    const printfulId = Number(product?.id);

    if (!printfulId) {
      results.push({
        status: "skipped",
        reason: "Missing Printful product ID",
        name: product?.name || "Unknown",
      });
      continue;
    }

    try {
      const detailResponse = await getProduct(printfulId);

      const syncProduct = detailResponse?.result?.sync_product;
      const variants = detailResponse?.result?.sync_variants || [];

      if (!syncProduct?.id) {
        results.push({
          status: "skipped",
          reason: "Missing sync product details",
          printful_id: printfulId,
          name: product?.name || "Unknown",
        });
        continue;
      }

      const activeVariants = variants.filter(
        (variant) =>
          variant?.availability_status === "active" &&
          !variant?.is_ignored
      );

      const prices = activeVariants
        .map((variant) => Number(variant?.retail_price))
        .filter((value) => Number.isFinite(value) && value > 0);

      const lowestPrice =
        prices.length > 0
          ? Math.min(...prices)
          : 29.99;

      const primaryVariant =
        activeVariants[0] ||
        variants[0] ||
        null;

      const sku =
        primaryVariant?.sku ||
        `PF-${printfulId}`;

      const imageSet = new Set();

      if (syncProduct?.thumbnail_url) {
        imageSet.add(syncProduct.thumbnail_url);
      }

      for (const variant of variants) {
        if (variant?.product?.image) {
          imageSet.add(variant.product.image);
        }

        for (const file of variant?.files || []) {
          if (file?.preview_url) {
            imageSet.add(file.preview_url);
          } else if (file?.thumbnail_url) {
            imageSet.add(file.thumbnail_url);
          }
        }
      }

      const images = Array.from(imageSet);

      const imageUrl =
        syncProduct?.thumbnail_url ||
        primaryVariant?.product?.image ||
        images[0] ||
        "";

      const merchandisePayload = {
        name: syncProduct.name || product.name || `Printful Product ${printfulId}`,

        description:
          `Official PulsePlay merchandise powered by Printful. ` +
          `Available in multiple variants and sizes.`,

        category: "Gaming Merchandise",
        collection: "PulsePlay",
        price: lowestPrice.toFixed(2),
        sku,
        supplier: "Printful",

        image_url: imageUrl,
        thumbnail_url: syncProduct?.thumbnail_url || imageUrl,
        images,

        product_url: "",
        status: syncProduct?.is_ignored ? "inactive" : "active",

        printful_id: printfulId,
        printful_external_id:
          syncProduct?.external_id || null,

        variants,
      };

      const { data: existing, error: lookupError } = await supabase
        .from("merchandise")
        .select("id")
        .eq("printful_id", printfulId)
        .maybeSingle();

      if (lookupError) {
        throw lookupError;
      }

      let saved;
      let action;

      if (existing?.id) {
        const { data, error } = await supabase
          .from("merchandise")
          .update(merchandisePayload)
          .eq("id", existing.id)
          .select()
          .single();

        if (error) {
          throw error;
        }

        saved = data;
        action = "updated";
      } else {
        const { data, error } = await supabase
          .from("merchandise")
          .insert(merchandisePayload)
          .select()
          .single();

        if (error) {
          throw error;
        }

        saved = data;
        action = "inserted";
      }

      results.push({
        status: action,
        printful_id: printfulId,
        name: merchandisePayload.name,
        variants: variants.length,
        price: merchandisePayload.price,
        merchandise_id: saved?.id,
      });
    } catch (error) {
      console.error(
        `Failed to sync Printful product ${printfulId}:`,
        error
      );

      results.push({
        status: "error",
        printful_id: printfulId,
        name: product?.name || "Unknown",
        error: error?.message || "Unknown error",
      });
    }
  }

  return {
    success: true,
    total: products.length,
    inserted: results.filter((item) => item.status === "inserted").length,
    updated: results.filter((item) => item.status === "updated").length,
    skipped: results.filter((item) => item.status === "skipped").length,
    errors: results.filter((item) => item.status === "error").length,
    products: results,
  };
}
