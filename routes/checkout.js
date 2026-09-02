import express from "express";
import Stripe from "stripe";

import supabase from "../lib/supabase.js";

const router = express.Router();

const stripe = new Stripe(
  process.env.STRIPE_SECRET_KEY
);

router.post("/create-session", async (req, res) => {
  try {
    const {
      merchandiseId,
      variantId,
      quantity = 1,
    } = req.body;

    if (!merchandiseId || !variantId) {
      return res.status(400).json({
        success: false,
        error: "Merchandise ID and variant ID are required.",
      });
    }

    const safeQuantity = Number(quantity);

    if (
      !Number.isInteger(safeQuantity) ||
      safeQuantity < 1 ||
      safeQuantity > 10
    ) {
      return res.status(400).json({
        success: false,
        error: "Quantity must be between 1 and 10.",
      });
    }

    const { data: merchandise, error } = await supabase
      .from("merchandise")
      .select("*")
      .eq("id", merchandiseId)
      .single();

    if (error || !merchandise) {
      return res.status(404).json({
        success: false,
        error: "Merchandise not found.",
      });
    }

    const variant = (merchandise.variants || []).find(
      (item) => Number(item.id) === Number(variantId)
    );

    if (!variant) {
      return res.status(404).json({
        success: false,
        error: "Selected merchandise variant not found.",
      });
    }

    const price = Number(
      variant.retail_price || merchandise.price
    );

    if (!Number.isFinite(price) || price <= 0) {
      return res.status(400).json({
        success: false,
        error: "Invalid merchandise price.",
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",

      line_items: [
        {
          price_data: {
            currency: (
              variant.currency ||
              "USD"
            ).toLowerCase(),

            product_data: {
              name: `${merchandise.name} - ${variant.name}`,

              images: merchandise.image_url
                ? [merchandise.image_url]
                : undefined,
            },

            unit_amount: Math.round(price * 100),
          },

          quantity: safeQuantity,
        },
      ],

      shipping_address_collection: {
        allowed_countries: ["US"],
      },

      metadata: {
        merchandise_id: String(merchandise.id),
        variant_id: String(variant.id),
        printful_variant_id: String(
          variant.variant_id ||
          variant.product?.variant_id ||
          variant.id
        ),
        quantity: String(safeQuantity),
      },

      success_url:
        "https://pulseplay.online/merchandise/success?session_id={CHECKOUT_SESSION_ID}",

      cancel_url:
        "https://pulseplay.online/merchandise/cancelled",
    });

    return res.json({
      success: true,
      checkout_url: session.url,
    });
  } catch (error) {
    console.error(
      "Stripe checkout error:",
      error
    );

    return res.status(500).json({
      success: false,
      error: "Unable to create checkout session.",
    });
  }
});

export default router;
