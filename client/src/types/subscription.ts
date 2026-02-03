/**
 * Shared subscription / monetization types used across the frontend.
 * These mirror the exact shapes returned by the backend API.
 */

// ---------------------------------------------------------------------------
// Subscription tier & status
// ---------------------------------------------------------------------------

/** Subscription pricing tier -- matches server SubscriptionTier. */
export type SubscriptionTier = 'free' | 'pro';

/** Subscription lifecycle status -- matches server SubscriptionStatus. */
export type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'incomplete';

// ---------------------------------------------------------------------------
// Premium features
// ---------------------------------------------------------------------------

/** Boolean flags for each premium perk -- matches server PremiumFeatures. */
export interface PremiumFeatures {
  unlimitedChallenges: boolean;
  proBadge: boolean;
  detailedAnalytics: boolean;
  adFree: boolean;
  priorityImageGen: boolean;
}

// ---------------------------------------------------------------------------
// User subscription (public shape from API)
// ---------------------------------------------------------------------------

/**
 * Public subscription as returned by the API (matches server PublicSubscription).
 * Stripe IDs are excluded on the server side.
 */
export interface UserSubscription {
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  premiumFeatures: PremiumFeatures;
}

// ---------------------------------------------------------------------------
// API response wrappers -- Subscription status
// ---------------------------------------------------------------------------

/** Response from GET /api/subscriptions/status. */
export interface SubscriptionStatusResponse {
  tier: SubscriptionTier;
  features: PremiumFeatures;
  subscription: PublicSubscription | null;
}

/**
 * Full public subscription record as returned inside the status response.
 * Mirrors server PublicSubscription (no Stripe IDs).
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

// ---------------------------------------------------------------------------
// API response wrappers -- Checkout & Portal
// ---------------------------------------------------------------------------

/** Response from POST /api/subscriptions/checkout. */
export interface CheckoutResponse {
  url: string;
}

/** Response from POST /api/subscriptions/portal. */
export interface PortalResponse {
  url: string;
}

// ---------------------------------------------------------------------------
// Challenge limits
// ---------------------------------------------------------------------------

/** Challenge usage / limit info derived from the user's tier. */
export interface ChallengeLimit {
  allowed: number;
  used: number;
  remaining: number;
  isPro: boolean;
}

// ---------------------------------------------------------------------------
// Pro plan pricing constants
// ---------------------------------------------------------------------------

/** Monthly price displayed in the UI. */
export const PRO_MONTHLY_PRICE = '$4.99';

/** ISO 4217 currency code for Pro plan pricing. */
export const PRO_CURRENCY = 'USD';

/** Human-readable Pro plan name. */
export const PRO_PLAN_NAME = 'Slop Guess Pro';
