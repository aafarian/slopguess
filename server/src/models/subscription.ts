/**
 * Subscription model types.
 * Defines the database row shape, public API shape (no Stripe IDs),
 * tier/status unions, and premium feature flags.
 */

/** Subscription pricing tier. */
export type SubscriptionTier = 'free' | 'pro';

/** Subscription lifecycle status. */
export type SubscriptionStatus = 'active' | 'purchased';

/** Full subscription row as stored in PostgreSQL. */
export interface SubscriptionRow {
  id: string;
  user_id: string;
  stripe_customer_id: string;
  stripe_payment_intent_id: string | null;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  purchased_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Public subscription returned by API responses.
 * Excludes stripe_customer_id and stripe_payment_intent_id (sensitive).
 */
export interface PublicSubscription {
  id: string;
  userId: string;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  purchasedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Boolean flags for each premium perk, derived from tier at runtime. */
export interface PremiumFeatures {
  adFree: boolean;
  proBadge: boolean;
}

/**
 * Strips Stripe IDs from a SubscriptionRow and converts to camelCase
 * to produce a safe PublicSubscription.
 */
export function toPublicSubscription(row: SubscriptionRow): PublicSubscription {
  return {
    id: row.id,
    userId: row.user_id,
    tier: row.tier,
    status: row.status,
    purchasedAt: row.purchased_at instanceof Date
      ? row.purchased_at.toISOString()
      : row.purchased_at,
    createdAt: row.created_at instanceof Date
      ? row.created_at.toISOString()
      : String(row.created_at),
    updatedAt: row.updated_at instanceof Date
      ? row.updated_at.toISOString()
      : String(row.updated_at),
  };
}

/** Maps a subscription tier to its corresponding premium feature flags. */
export function getPremiumFeaturesForTier(tier: SubscriptionTier): PremiumFeatures {
  switch (tier) {
    case 'pro':
      return {
        adFree: true,
        proBadge: true,
      };
    case 'free':
    default:
      return {
        adFree: false,
        proBadge: false,
      };
  }
}
