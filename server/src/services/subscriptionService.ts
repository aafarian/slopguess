/**
 * Subscription service — pure database logic for subscription management.
 *
 * Handles tier lookups, premium feature resolution, and free-tier subscription
 * creation. All Stripe interactions are delegated to stripeService; this module
 * is intentionally Stripe-free.
 */

import { pool } from "../config/database";
import { logger } from "../config/logger";
import type {
  SubscriptionRow,
  SubscriptionTier,
  PremiumFeatures,
  PublicSubscription,
} from "../models/subscription";
import { toPublicSubscription, getPremiumFeaturesForTier } from "../models/subscription";

// ---------------------------------------------------------------------------
// Service methods
// ---------------------------------------------------------------------------

/**
 * Get a user's subscription row.
 *
 * Looks up the subscriptions table by user_id and returns the full
 * public subscription (Stripe IDs stripped). Returns null if the user
 * has no subscription row yet.
 *
 * @param userId - UUID of the user
 * @returns The PublicSubscription, or null if not found
 */
async function getSubscription(userId: string): Promise<PublicSubscription | null> {
  const result = await pool.query<SubscriptionRow>(
    `SELECT * FROM subscriptions WHERE user_id = $1`,
    [userId],
  );

  if (result.rows.length === 0) {
    return null;
  }

  return toPublicSubscription(result.rows[0]);
}

/**
 * Get a user's current subscription tier.
 *
 * Reads directly from the users.subscription_tier column for fast lookups
 * without joining the subscriptions table. Falls back to 'free' if the
 * column is null or the user is not found.
 *
 * @param userId - UUID of the user
 * @returns The user's subscription tier
 */
async function getUserTier(userId: string): Promise<SubscriptionTier> {
  const result = await pool.query<{ subscription_tier: SubscriptionTier | null }>(
    `SELECT subscription_tier FROM users WHERE id = $1`,
    [userId],
  );

  if (result.rows.length === 0) {
    logger.warn("subscriptionService", `User not found for tier lookup: ${userId}`, { userId });
    return "free";
  }

  return result.rows[0].subscription_tier ?? "free";
}

/**
 * Get the premium feature flags for a user.
 *
 * Resolves the user's tier and maps it to the corresponding PremiumFeatures
 * object using the model's getPremiumFeaturesForTier helper.
 *
 * @param userId - UUID of the user
 * @returns PremiumFeatures flags based on the user's tier
 */
async function getPremiumFeatures(userId: string): Promise<PremiumFeatures> {
  const tier = await getUserTier(userId);
  return getPremiumFeaturesForTier(tier);
}

/**
 * Create a free-tier subscription for a new user.
 *
 * Inserts a row in the subscriptions table with tier='free' and
 * status='active'. Intended to be called during user registration
 * so every user has a subscription row from day one.
 *
 * @param userId - UUID of the newly created user
 * @returns The created PublicSubscription
 */
async function createFreeSubscription(userId: string): Promise<PublicSubscription> {
  const result = await pool.query<SubscriptionRow>(
    `INSERT INTO subscriptions (user_id, stripe_customer_id, tier, status)
     VALUES ($1, '', 'free', 'active')
     RETURNING *`,
    [userId],
  );

  logger.info("subscriptionService", `Created free subscription for user ${userId}`, { userId });

  return toPublicSubscription(result.rows[0]);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const subscriptionService = {
  getSubscription,
  getUserTier,
  getPremiumFeatures,
  createFreeSubscription,
};
