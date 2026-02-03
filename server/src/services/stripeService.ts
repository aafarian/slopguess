/**
 * Stripe payment service.
 *
 * Wraps the Stripe SDK for one-time payment management:
 * - Checkout session creation for one-time Pro purchase
 * - Checkout session creation for print shop orders (dynamic pricing)
 * - Webhook event processing for checkout completion
 *
 * All methods are guarded by isStripeConfigured(). If Stripe keys are
 * not set (e.g. in local dev), methods throw a descriptive error.
 */

import Stripe from "stripe";
import { env, isStripeConfigured } from "../config/env";
import { pool } from "../config/database";
import { logger } from "../config/logger";
import { notificationService } from "./notificationService";
import { printOrderService } from "./printOrderService";
import type { SubscriptionTier } from "../models/subscription";

// ---------------------------------------------------------------------------
// Stripe SDK singleton (lazy-initialized)
// ---------------------------------------------------------------------------

let _stripe: Stripe | null = null;

function getStripe(): Stripe {
  if (!isStripeConfigured()) {
    throw new Error(
      "Stripe is not configured. Set STRIPE_SECRET_KEY in your environment to enable payment features.",
    );
  }
  if (!_stripe) {
    _stripe = new Stripe(env.STRIPE_SECRET_KEY, {
      apiVersion: "2026-01-28.clover",
    });
  }
  return _stripe;
}

/**
 * Guard helper. Throws a descriptive error when Stripe is not configured.
 */
function requireStripe(): void {
  if (!isStripeConfigured()) {
    throw new Error(
      "Stripe is not configured. Set STRIPE_SECRET_KEY in your environment to enable payment features.",
    );
  }
}

// ---------------------------------------------------------------------------
// Customer management
// ---------------------------------------------------------------------------

/**
 * Get or create a Stripe customer for the given user.
 *
 * Looks up an existing subscription row with a stripe_customer_id.
 * If none exists, creates a new Stripe customer and inserts a
 * subscription row with tier='free' and status='active'.
 */
async function getOrCreateCustomer(userId: string, email: string): Promise<string> {
  requireStripe();
  const stripe = getStripe();

  // Check for existing subscription row with a Stripe customer
  const existing = await pool.query(
    `SELECT stripe_customer_id FROM subscriptions WHERE user_id = $1 LIMIT 1`,
    [userId],
  );

  if (existing.rows.length > 0 && existing.rows[0].stripe_customer_id) {
    return existing.rows[0].stripe_customer_id as string;
  }

  // Create a new Stripe customer
  const customer = await stripe.customers.create({
    email,
    metadata: { userId },
  });

  logger.info("stripeService", "Created Stripe customer", {
    userId,
    customerId: customer.id,
  });

  // Upsert a subscription row (free tier by default)
  await pool.query(
    `INSERT INTO subscriptions (user_id, stripe_customer_id, tier, status)
     VALUES ($1, $2, 'free', 'active')
     ON CONFLICT (user_id)
     DO UPDATE SET stripe_customer_id = $2, updated_at = NOW()`,
    [userId, customer.id],
  );

  return customer.id;
}

// ---------------------------------------------------------------------------
// Checkout session
// ---------------------------------------------------------------------------

/**
 * Create a Stripe Checkout session for a one-time Pro purchase.
 *
 * Returns the checkout session URL that the client should redirect to.
 */
async function createCheckoutSession(
  userId: string,
  priceId: string,
): Promise<string> {
  requireStripe();
  const stripe = getStripe();

  // Look up user email for customer creation
  const userResult = await pool.query(
    `SELECT email FROM users WHERE id = $1`,
    [userId],
  );
  if (userResult.rows.length === 0) {
    throw new Error(`User not found: ${userId}`);
  }
  const email = userResult.rows[0].email as string;

  const customerId = await getOrCreateCustomer(userId, email);

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "payment",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${env.CORS_ORIGIN}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${env.CORS_ORIGIN}/pricing`,
    metadata: { userId },
  });

  logger.info("stripeService", "Created checkout session", {
    userId,
    sessionId: session.id,
    priceId,
  });

  if (!session.url) {
    throw new Error("Stripe checkout session did not return a URL");
  }

  return session.url;
}

// ---------------------------------------------------------------------------
// Print order checkout
// ---------------------------------------------------------------------------

/** Parameters for creating a print-order Stripe Checkout session. */
interface PrintOrderCheckoutParams {
  userId: string;
  orderId: string;
  totalCostCents: number;
  currency: string;
  productDescription: string;
}

/**
 * Create a Stripe Checkout session for a print shop order.
 *
 * Uses `price_data` for dynamic pricing (each order can have a different
 * total depending on frame size, style, and margin). The session metadata
 * includes `type: 'print_order'` so the webhook handler can route the
 * completed checkout to printOrderService.confirmPayment().
 *
 * Returns the checkout session URL that the client should redirect to.
 */
async function createPrintOrderCheckoutSession(
  params: PrintOrderCheckoutParams,
): Promise<string> {
  requireStripe();
  const stripe = getStripe();

  const { userId, orderId, totalCostCents, currency, productDescription } = params;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: currency.toLowerCase(),
          product_data: {
            name: productDescription,
          },
          unit_amount: totalCostCents,
        },
        quantity: 1,
      },
    ],
    metadata: {
      userId,
      orderId,
      type: "print_order",
    },
    success_url: `${env.CORS_ORIGIN}/print-shop/orders/${orderId}?status=success`,
    cancel_url: `${env.CORS_ORIGIN}/print-shop/orders/${orderId}?status=cancelled`,
  });

  logger.info("stripeService", "Created print order checkout session", {
    userId,
    orderId,
    sessionId: session.id,
    totalCostCents,
    currency,
  });

  if (!session.url) {
    throw new Error("Stripe checkout session did not return a URL");
  }

  return session.url;
}

// ---------------------------------------------------------------------------
// Webhook handling
// ---------------------------------------------------------------------------

/**
 * Verify and process a Stripe webhook event.
 *
 * Uses stripe.webhooks.constructEvent for signature verification.
 * Only handles checkout.session.completed for one-time payments.
 */
async function handleWebhookEvent(
  payload: string | Buffer,
  signature: string,
): Promise<void> {
  requireStripe();
  const stripe = getStripe();

  if (!env.STRIPE_WEBHOOK_SECRET) {
    throw new Error(
      "STRIPE_WEBHOOK_SECRET is not configured. Cannot verify webhook signatures.",
    );
  }

  const event = stripe.webhooks.constructEvent(
    payload,
    signature,
    env.STRIPE_WEBHOOK_SECRET,
  );

  logger.info("stripeService", `Processing webhook event: ${event.type}`, {
    eventId: event.id,
    eventType: event.type,
  });

  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
      break;
    default:
      logger.debug("stripeService", `Unhandled event type: ${event.type}`, {
        eventId: event.id,
      });
  }
}

// ---------------------------------------------------------------------------
// Webhook event handlers
// ---------------------------------------------------------------------------

/**
 * Handle checkout.session.completed.
 *
 * Routes to the correct handler based on session.metadata.type:
 * - 'print_order': confirms payment for a print shop order via printOrderService
 * - default (no type or any other value): existing Pro purchase flow
 *
 * This ensures backwards compatibility -- existing Pro purchase checkouts
 * that have no `type` metadata continue to work as before.
 */
async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const userId = session.metadata?.userId;
  if (!userId) {
    logger.warn("stripeService", "Checkout session missing userId metadata", {
      sessionId: session.id,
    });
    return;
  }

  const metadataType = session.metadata?.type;

  if (metadataType === "print_order") {
    await handlePrintOrderCheckoutCompleted(session);
  } else {
    await handleProPurchaseCheckoutCompleted(session);
  }
}

/**
 * Handle checkout.session.completed for print shop orders.
 *
 * Calls printOrderService.confirmPayment() with the orderId from metadata
 * and the Stripe payment intent ID. This marks the order as paid and
 * submits it to Prodigi for fulfillment.
 */
async function handlePrintOrderCheckoutCompleted(
  session: Stripe.Checkout.Session,
): Promise<void> {
  const userId = session.metadata?.userId;
  const orderId = session.metadata?.orderId;
  const paymentIntentId = session.payment_intent as string | null;

  if (!orderId) {
    logger.warn("stripeService", "Print order checkout missing orderId metadata", {
      sessionId: session.id,
      userId,
    });
    return;
  }

  if (!paymentIntentId) {
    logger.warn("stripeService", "Print order checkout missing payment_intent", {
      sessionId: session.id,
      userId,
      orderId,
    });
    return;
  }

  try {
    await printOrderService.confirmPayment(orderId, paymentIntentId);

    logger.info("stripeService", "Print order payment confirmed via checkout", {
      userId,
      orderId,
      paymentIntentId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("stripeService", "Failed to confirm print order payment", {
      userId,
      orderId,
      paymentIntentId,
      error: message,
    });
  }
}

/**
 * Handle checkout.session.completed for Pro purchases (original flow).
 *
 * Sets tier=pro, status=purchased, records the payment intent ID and
 * purchased_at timestamp. Updates users.subscription_tier = 'pro'.
 */
async function handleProPurchaseCheckoutCompleted(
  session: Stripe.Checkout.Session,
): Promise<void> {
  const userId = session.metadata?.userId as string;
  const customerId = session.customer as string | null;
  const paymentIntentId = session.payment_intent as string | null;

  if (!customerId) {
    logger.warn("stripeService", "Checkout session missing customer", {
      sessionId: session.id,
    });
    return;
  }

  // Idempotency guard: skip if this user is already purchased.
  // Stripe may deliver checkout.session.completed more than once.
  const existing = await pool.query(
    `SELECT status FROM subscriptions WHERE user_id = $1 AND status = 'purchased' LIMIT 1`,
    [userId],
  );
  if (existing.rows.length > 0) {
    logger.info("stripeService", "Skipping duplicate checkout webhook — user already purchased", {
      userId,
      sessionId: session.id,
    });
    return;
  }

  await upsertSubscription(userId, {
    stripeCustomerId: customerId,
    stripePaymentIntentId: paymentIntentId,
    tier: "pro",
    status: "purchased",
  });

  await updateUserTier(userId, "pro");

  await notifyPurchase(userId);

  logger.info("stripeService", "Pro purchase activated via checkout", {
    userId,
    paymentIntentId,
  });
}

// ---------------------------------------------------------------------------
// Database helpers
// ---------------------------------------------------------------------------

interface SubscriptionUpsertData {
  stripeCustomerId: string;
  stripePaymentIntentId: string | null;
  tier: SubscriptionTier;
  status: 'active' | 'purchased';
}

/**
 * Upsert a subscription row for the given user.
 */
async function upsertSubscription(userId: string, data: SubscriptionUpsertData): Promise<void> {
  await pool.query(
    `INSERT INTO subscriptions (
       user_id, stripe_customer_id, stripe_payment_intent_id,
       tier, status, purchased_at
     ) VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (user_id)
     DO UPDATE SET
       stripe_customer_id = $2,
       stripe_payment_intent_id = $3,
       tier = $4,
       status = $5,
       purchased_at = NOW(),
       updated_at = NOW()`,
    [
      userId,
      data.stripeCustomerId,
      data.stripePaymentIntentId,
      data.tier,
      data.status,
    ],
  );
}

/**
 * Update users.subscription_tier for a given user.
 */
async function updateUserTier(userId: string, tier: SubscriptionTier): Promise<void> {
  await pool.query(
    `UPDATE users SET subscription_tier = $1, updated_at = NOW() WHERE id = $2`,
    [tier, userId],
  );
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

/**
 * Send a notification to the user when their Pro purchase completes.
 */
async function notifyPurchase(userId: string): Promise<void> {
  try {
    const message = "Your Pro purchase is complete! Enjoy ad-free gameplay and your Pro badge.";

    // Cast to allow the subscription-related notification type
    await (notificationService.addNotification as Function)(
      userId,
      "subscription_update",
      { tier: "pro", status: "purchased", message },
    );
  } catch (err) {
    // Notification failure should not block webhook processing
    const errMessage = err instanceof Error ? err.message : String(err);
    logger.warn("stripeService", "Failed to send purchase notification", {
      userId,
      error: errMessage,
    });
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const stripeService = {
  getOrCreateCustomer,
  createCheckoutSession,
  createPrintOrderCheckoutSession,
  handleWebhookEvent,
};
