import express from "express";
import Stripe from "stripe";

import supabase from "../lib/supabase.js";
import { createOrder as createPrintfulOrder } from "../services/pod/printful.js";

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

        if (
          !customerName ||
          !customerEmail ||
          !shippingAddress?.line1 ||
          !shippingAddress?.city ||
          !shippingAddress?.state ||
          !shippingAddress?.postal_code ||
          !shippingAddress?.country
        ) {
          console.error(
            "Stripe session is missing required shipping details:",
            session.id
          );

          return res.status(400).send(
            "Missing shipping details."
          );
        }

        const { data: existingOrder, error: lookupError } =
          await supabase
            .from("orders")
            .select("id, printful_order_id")
            .eq(
              "stripe_session_id",
              session.id
            )
            .maybeSingle();

        if (lookupError) {
          console.error(
            "Supabase order lookup failed:",
            lookupError
          );

          return res.status(500).send(
            "Failed to check existing order."
          );
        }

        if (existingOrder?.printful_order_id) {
          console.log(
            "Stripe order already completed:",
            session.id
          );

          return res.json({
            received: true,
            duplicate: true,
          });
        }

        let order;

        if (existingOrder) {
          order = existingOrder;

          console.log(
            "Existing paid order needs Printful processing:",
            order.id
          );
        } else {
          const { data: newOrder, error } =
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

          order = newOrder;

          console.log(
            "PulsePlay order recorded:",
            order.id
          );
        }

        const printfulOrder =
          await createPrintfulOrder({
            recipient: {
              name:
                customerName,

              email:
                customerEmail,

              phone:
                session.customer_details?.phone ||
                undefined,

              address1:
                shippingAddress.line1,

              address2:
                shippingAddress.line2 ||
                undefined,

              city:
                shippingAddress.city,

              state_code:
                shippingAddress.state,

              country_code:
                shippingAddress.country,

              zip:
                shippingAddress.postal_code,
            },

            items: [
              {
                sync_variant_id:
                  Number(variantId),

                quantity,
              },
            ],
          });

        const printfulOrderId =
          printfulOrder?.result?.id;

        if (!printfulOrderId) {
          console.error(
            "Printful draft order did not return an order ID:",
            printfulOrder
          );

          return res.status(500).send(
            "Printful draft order creation failed."
          );
        }

        const { error: printfulUpdateError } =
          await supabase
            .from("orders")
            .update({
              printful_order_id:
                Number(printfulOrderId),
            })
            .eq(
              "id",
              order.id
            );

        if (printfulUpdateError) {
          console.error(
            "Supabase Printful order update failed:",
            printfulUpdateError
          );

          return res.status(500).send(
            "Failed to update Printful order ID."
          );
        }

        console.log(
          "Printful draft order created:",
          printfulOrderId
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
