import express from "express";
import {
  listProducts,
  getProduct,
} from "../services/pod/printful.js";

import {
  syncPrintfulMerchandise,
} from "../services/pod/merchService.js";

const router = express.Router();

router.get("/products", async (req, res) => {
  try {
    const data = await listProducts();
    res.json(data);
  } catch (error) {
    console.error("Printful products error:", error);

    res.status(500).json({
      success: false,
      error: error.message || "Failed to retrieve Printful products",
    });
  }
});

router.get("/products/:id", async (req, res) => {
  try {
    const data = await getProduct(req.params.id);
    res.json(data);
  } catch (error) {
    console.error("Printful product error:", error);

    res.status(500).json({
      success: false,
      error: error.message || "Failed to retrieve Printful product",
    });
  }
});

/*
 * Sync existing Printful store products into PulsePlay.
 *
 * This does NOT create products in Printful.
 * This does NOT delete merchandise from PulsePlay.
 *
 * Existing Printful products are updated by printful_id.
 * Missing products are inserted.
 */
router.post("/sync-merchandise", async (req, res) => {
  try {
    console.log("Starting Printful merchandise sync...");

    const result = await syncPrintfulMerchandise();

    console.log(
      `Printful merchandise sync complete: ${result.inserted} inserted, ${result.updated} updated, ${result.errors} errors`
    );

    res.json(result);
  } catch (error) {
    console.error("Printful merchandise sync error:", error);

    res.status(500).json({
      success: false,
      error:
        error.message ||
        "Failed to synchronize Printful merchandise",
    });
  }
});

export default router;
