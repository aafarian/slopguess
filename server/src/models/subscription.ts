/**
 * Subscription model types.
 * Defines the database row shape, public API shape (no Stripe IDs),
 * tier/status unions, and premium feature flags.
 */

/** Subscription pricing tier. */
export type SubscriptionTier = 'free' | 'pro';

/** Subscription lifecycle status. */
export type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'incomplete';

/** Full subscription row as stored in PostgreSQL. */
export interface SubscriptionRow {
  id: string;
  user_id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string | null;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  current_period_start: Date | null;
  current_period_end: Date | null;
  cancel_at_period_end: boolean;
  created_at: Date;
  updated_at: Date;
}

/**
 * Public subscription returned by API responses.
 * Excludes stripe_customer_id and stripe_subscription_id (sensitive).
 */
export interface PublicSubscription {
  id: string;
  userId: string;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Boolean flags for each premium perk, derived from tier at runtime. */
export interface PremiumFeatures {
  unlimitedChallenges: boolean;
  proBadge: boolean;
  detailedAnalytics: boolean;
  adFree: boolean;
  priorityImageGen: boolean;
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
    currentPeriodStart: row.current_period_start instanceof Date
      ? row.current_period_start.toISOString()
      : row.current_period_start,
    currentPeriodEnd: row.current_period_end instanceof Date
      ? row.current_period_end.toISOString()
      : row.current_period_end,
    cancelAtPeriodEnd: row.cancel_at_period_end,
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
        unlimitedChallenges: true,
        proBadge: true,
        detailedAnalytics: true,
        adFree: true,
        priorityImageGen: true,
      };
    case 'free':
    default:
      return {
        unlimitedChallenges: false,
        proBadge: false,
        detailedAnalytics: false,
        adFree: false,
        priorityImageGen: false,
      };
  }
}
