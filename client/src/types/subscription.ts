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
export type SubscriptionStatus = 'active' | 'purchased';

// ---------------------------------------------------------------------------
// Premium features
// ---------------------------------------------------------------------------

/** Boolean flags for each premium perk -- matches server PremiumFeatures. */
export interface PremiumFeatures {
  adFree: boolean;
  proBadge: boolean;
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
  purchasedAt: string | null;
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
  /** Whether monetization features are enabled on the server. */
  monetizationEnabled: boolean;
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
  purchasedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// API response wrappers -- Checkout
// ---------------------------------------------------------------------------

/** Response from POST /api/subscriptions/checkout. */
export interface CheckoutResponse {
  url: string;
}

// ---------------------------------------------------------------------------
// Pro plan pricing constants
// ---------------------------------------------------------------------------

/** One-time price displayed in the UI. */
export const PRO_PRICE = '$5.00';

/** ISO 4217 currency code for Pro plan pricing. */
export const PRO_CURRENCY = 'USD';

/** Human-readable Pro plan name. */
export const PRO_PLAN_NAME = 'Slop Guess Pro';
