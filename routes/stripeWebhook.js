import express from "express";
import Stripe from "stripe";

import supabase from "../lib/supabase.js";

const router = express.Router();

const stripe = new Stripe(
  process.env.STRIPE_SECRET_KEY
);

router.post(
  "/webhook",
  (req,res,next) => { console.log("🔥 STRIPE WEBHOOK REQUEST RECEIVED"); next(); },
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.headers["stripe-signature"];

    if (!signature) {
      return res.status(400).send("Missing Stripe signature.");
    }

    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (error) {
      console.error(
        "Stripe webhook signature verification failed:",
        error.message
      );

      return res.status(400).send(
        "Webhook signature verification failed."
      );
    }

    try {
      if (event.type === "checkout.session.completed") {
        const session = event.data.object;

        const metadata = session.metadata || {};

        const merchandiseId =
          metadata.merchandise_id;

        const variantId =
          metadata.variant_id;

        const printfulVariantId =
          metadata.printful_variant_id;

        const quantity =
          Number(metadata.quantity || 1);

        if (
          !merchandiseId ||
          !variantId ||
          !printfulVariantId
        ) {
          console.error(
            "Stripe session is missing merchandise metadata:",
            session.id
          );

          return res.status(400).send(
            "Missing merchandise metadata."
          );
        }

        const amountTotal =
          Number(session.amount_total || 0);

        const currency =
          session.currency || "usd";

        const customerEmail =
          session.customer_details?.email || null;

        const customerName =
          session.customer_details?.name || null;

        const shippingAddress =
          session.customer_details?.address || null;

        const { data: existingOrder } =
          await supabase
            .from("orders")
            .select("id")
            .eq(
              "stripe_session_id",
              session.id
            )
            .maybeSingle();

        if (existingOrder) {
          console.log(
            "Stripe order already recorded:",
            session.id
          );

          return res.json({
            received: true,
            duplicate: true,
          });
        }

        const { data: order, error } =
          await supabase
            .from("orders")
            .insert({
              stripe_session_id:
                session.id,

              stripe_payment_intent_id:
                typeof session.payment_intent === "string"
                  ? session.payment_intent
                  : null,

              customer_email:
                customerEmail,

              customer_name:
                customerName,

              merchandise_id:
                merchandiseId,

              variant_id:
                Number(variantId),

              printful_variant_id:
                Number(printfulVariantId),

              quantity,

              amount_total:
                amountTotal,

              currency,

              status:
                "paid",

              shipping_address:
                shippingAddress,
            })
            .select()
            .single();

        if (error) {
          console.error(
            "Supabase order insert failed:",
            error
          );

          return res.status(500).send(
            "Failed to record order."
          );
        }

        console.log(
          "PulsePlay order recorded:",
          order.id
        );
      }

      return res.json({
        received: true,
      });
    } catch (error) {
      console.error(
        "Stripe webhook processing error:",
        error
      );

      return res.status(500).send(
        "Webhook processing failed."
      );
    }
  }
);

export default router;
