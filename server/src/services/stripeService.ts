/**
 * Stripe payment service.
 *
 * Wraps the Stripe SDK for subscription management:
 * - Checkout session creation for new subscriptions
 * - Customer portal sessions for self-service billing
 * - Webhook event processing for subscription lifecycle
 *
 * All methods are guarded by isStripeConfigured(). If Stripe keys are
 * not set (e.g. in local dev), methods throw a descriptive error.
 */

import Stripe from "stripe";
import { env, isStripeConfigured } from "../config/env";
import { pool } from "../config/database";
import { logger } from "../config/logger";
import { notificationService } from "./notificationService";
import type { SubscriptionStatus, SubscriptionTier } from "../models/subscription";

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
 * Create a Stripe Checkout session for a subscription purchase.
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
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${env.CORS_ORIGIN}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${env.CORS_ORIGIN}/subscription/cancel`,
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
// Customer portal
// ---------------------------------------------------------------------------

/**
 * Create a Stripe Customer Portal session for self-service billing.
 *
 * Returns the portal URL that the client should redirect to.
 */
async function createCustomerPortalSession(userId: string): Promise<string> {
  requireStripe();
  const stripe = getStripe();

  // Find the customer ID from the subscription row
  const subResult = await pool.query(
    `SELECT stripe_customer_id FROM subscriptions WHERE user_id = $1 LIMIT 1`,
    [userId],
  );
  if (subResult.rows.length === 0 || !subResult.rows[0].stripe_customer_id) {
    throw new Error("No Stripe customer found for this user. Subscribe first.");
  }

  const customerId = subResult.rows[0].stripe_customer_id as string;

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${env.CORS_ORIGIN}/settings`,
  });

  logger.info("stripeService", "Created customer portal session", {
    userId,
    customerId,
  });

  return session.url;
}

// ---------------------------------------------------------------------------
// Webhook handling
// ---------------------------------------------------------------------------

/**
 * Verify and process a Stripe webhook event.
 *
 * Uses stripe.webhooks.constructEvent for signature verification.
 * Dispatches to the appropriate handler based on event type.
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
    case "customer.subscription.updated":
      await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
      break;
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
      break;
    case "invoice.payment_failed":
      await handlePaymentFailed(event.data.object as Stripe.Invoice);
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
 * Handle checkout.session.completed: activate the subscription.
 *
 * Creates or updates the subscription row to 'pro' / 'active' and
 * sets users.subscription_tier = 'pro'.
 */
async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const userId = session.metadata?.userId;
  if (!userId) {
    logger.warn("stripeService", "Checkout session missing userId metadata", {
      sessionId: session.id,
    });
    return;
  }

  const subscriptionId = session.subscription as string | null;
  const customerId = session.customer as string | null;

  if (!subscriptionId || !customerId) {
    logger.warn("stripeService", "Checkout session missing subscription or customer", {
      sessionId: session.id,
    });
    return;
  }

  // Fetch subscription details from Stripe for period dates
  const stripe = getStripe();
  const stripeSub = await stripe.subscriptions.retrieve(subscriptionId);

  // In Stripe API 2026-01-28+, period dates are on subscription items
  const firstItem = stripeSub.items?.data?.[0];
  const periodStart = firstItem?.current_period_start ?? stripeSub.start_date;
  const periodEnd = firstItem?.current_period_end ?? stripeSub.start_date;

  await upsertSubscription(userId, {
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
    tier: "pro",
    status: "active",
    currentPeriodStart: new Date(periodStart * 1000),
    currentPeriodEnd: new Date(periodEnd * 1000),
    cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
  });

  await updateUserTier(userId, "pro");

  await notifySubscriptionChange(userId, "pro", "active");

  logger.info("stripeService", "Subscription activated via checkout", {
    userId,
    subscriptionId,
  });
}

/**
 * Handle customer.subscription.updated: plan changes, cancellation scheduling.
 *
 * Updates the subscription row with the latest status and period info.
 * If cancel_at_period_end flips to true, the user scheduled a cancellation.
 */
async function handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
  const userId = await findUserByCustomerId(subscription.customer as string);
  if (!userId) {
    logger.warn("stripeService", "No user found for customer in subscription.updated", {
      customerId: subscription.customer,
      subscriptionId: subscription.id,
    });
    return;
  }

  const status = mapStripeStatus(subscription.status);
  const tier: SubscriptionTier = status === "active" ? "pro" : "free";

  // In Stripe API 2026-01-28+, period dates are on subscription items
  const firstItem = subscription.items?.data?.[0];
  const periodStart = firstItem?.current_period_start ?? subscription.start_date;
  const periodEnd = firstItem?.current_period_end ?? subscription.start_date;

  await upsertSubscription(userId, {
    stripeCustomerId: subscription.customer as string,
    stripeSubscriptionId: subscription.id,
    tier,
    status,
    currentPeriodStart: new Date(periodStart * 1000),
    currentPeriodEnd: new Date(periodEnd * 1000),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  });

  await updateUserTier(userId, tier);

  await notifySubscriptionChange(userId, tier, status);

  logger.info("stripeService", "Subscription updated", {
    userId,
    subscriptionId: subscription.id,
    status,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  });
}

/**
 * Handle customer.subscription.deleted: downgrade to free.
 *
 * Sets tier to 'free' and status to 'canceled'.
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
  const userId = await findUserByCustomerId(subscription.customer as string);
  if (!userId) {
    logger.warn("stripeService", "No user found for customer in subscription.deleted", {
      customerId: subscription.customer,
      subscriptionId: subscription.id,
    });
    return;
  }

  await pool.query(
    `UPDATE subscriptions
     SET tier = 'free',
         status = 'canceled',
         stripe_subscription_id = NULL,
         cancel_at_period_end = FALSE,
         updated_at = NOW()
     WHERE user_id = $1`,
    [userId],
  );

  await updateUserTier(userId, "free");

  await notifySubscriptionChange(userId, "free", "canceled");

  logger.info("stripeService", "Subscription deleted, user downgraded to free", {
    userId,
    subscriptionId: subscription.id,
  });
}

/**
 * Handle invoice.payment_failed: mark subscription as past_due.
 */
async function handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  const customerId = invoice.customer as string | null;
  if (!customerId) {
    logger.warn("stripeService", "Payment failed invoice missing customer", {
      invoiceId: invoice.id,
    });
    return;
  }

  const userId = await findUserByCustomerId(customerId);
  if (!userId) {
    logger.warn("stripeService", "No user found for customer in payment_failed", {
      customerId,
      invoiceId: invoice.id,
    });
    return;
  }

  await pool.query(
    `UPDATE subscriptions
     SET status = 'past_due', updated_at = NOW()
     WHERE user_id = $1`,
    [userId],
  );

  await notifySubscriptionChange(userId, "pro", "past_due");

  logger.info("stripeService", "Subscription marked as past_due due to payment failure", {
    userId,
    invoiceId: invoice.id,
  });
}

// ---------------------------------------------------------------------------
// Database helpers
// ---------------------------------------------------------------------------

interface SubscriptionUpsertData {
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
}

/**
 * Upsert a subscription row for the given user.
 */
async function upsertSubscription(userId: string, data: SubscriptionUpsertData): Promise<void> {
  await pool.query(
    `INSERT INTO subscriptions (
       user_id, stripe_customer_id, stripe_subscription_id,
       tier, status, current_period_start, current_period_end,
       cancel_at_period_end
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (user_id)
     DO UPDATE SET
       stripe_customer_id = $2,
       stripe_subscription_id = $3,
       tier = $4,
       status = $5,
       current_period_start = $6,
       current_period_end = $7,
       cancel_at_period_end = $8,
       updated_at = NOW()`,
    [
      userId,
      data.stripeCustomerId,
      data.stripeSubscriptionId,
      data.tier,
      data.status,
      data.currentPeriodStart,
      data.currentPeriodEnd,
      data.cancelAtPeriodEnd,
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

/**
 * Look up the user ID for a given Stripe customer ID.
 */
async function findUserByCustomerId(customerId: string): Promise<string | null> {
  const result = await pool.query(
    `SELECT user_id FROM subscriptions WHERE stripe_customer_id = $1 LIMIT 1`,
    [customerId],
  );
  return result.rows.length > 0 ? (result.rows[0].user_id as string) : null;
}

/**
 * Map a Stripe subscription status string to our SubscriptionStatus type.
 */
function mapStripeStatus(stripeStatus: Stripe.Subscription.Status): SubscriptionStatus {
  switch (stripeStatus) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
      return "past_due";
    case "canceled":
    case "unpaid":
      return "canceled";
    case "incomplete":
    case "incomplete_expired":
      return "incomplete";
    default:
      return "active";
  }
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

/**
 * Send a notification to the user when their subscription status changes.
 */
async function notifySubscriptionChange(
  userId: string,
  tier: SubscriptionTier,
  status: SubscriptionStatus,
): Promise<void> {
  try {
    let message: string;

    if (tier === "pro" && status === "active") {
      message = "Your Pro subscription is now active! Enjoy unlimited challenges and premium features.";
    } else if (status === "past_due") {
      message = "Your subscription payment failed. Please update your payment method to keep Pro access.";
    } else if (status === "canceled" && tier === "free") {
      message = "Your Pro subscription has been canceled. You have been downgraded to the free tier.";
    } else {
      message = `Your subscription has been updated: tier=${tier}, status=${status}.`;
    }

    // Cast to allow the subscription-related notification type
    await (notificationService.addNotification as Function)(
      userId,
      "subscription_update",
      { tier, status, message },
    );
  } catch (err) {
    // Notification failure should not block webhook processing
    const errMessage = err instanceof Error ? err.message : String(err);
    logger.warn("stripeService", "Failed to send subscription notification", {
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
  createCustomerPortalSession,
  handleWebhookEvent,
};
