/**
 * Subscription service — typed wrappers around the /api/subscriptions endpoints.
 */

import { request } from './api';
import type {
  SubscriptionStatusResponse,
  CheckoutResponse,
  PortalResponse,
  ChallengeLimit,
} from '../types/subscription';

// ---------------------------------------------------------------------------
// Free-tier challenge constants
// ---------------------------------------------------------------------------

/** Maximum daily challenges allowed for free-tier users. */
const FREE_CHALLENGE_LIMIT = 3;

// ---------------------------------------------------------------------------
// Subscription status
// ---------------------------------------------------------------------------

/**
 * Fetch the current user's subscription status.
 * Requires authentication.
 *
 * GET /api/subscriptions/status
 */
export async function getSubscriptionStatus(): Promise<SubscriptionStatusResponse> {
  return request<SubscriptionStatusResponse>('/api/subscriptions/status');
}

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------

/**
 * Start a Stripe Checkout session and redirect the browser to the checkout URL.
 * Requires authentication.
 *
 * POST /api/subscriptions/checkout
 */
export async function startCheckout(): Promise<void> {
  const { url } = await request<CheckoutResponse>('/api/subscriptions/checkout', {
    method: 'POST',
  });
  window.location.href = url;
}

// ---------------------------------------------------------------------------
// Customer portal
// ---------------------------------------------------------------------------

/**
 * Open the Stripe Customer Portal and redirect the browser to the portal URL.
 * Requires authentication.
 *
 * POST /api/subscriptions/portal
 */
export async function openCustomerPortal(): Promise<void> {
  const { url } = await request<PortalResponse>('/api/subscriptions/portal', {
    method: 'POST',
  });
  window.location.href = url;
}

// ---------------------------------------------------------------------------
// Challenge limits
// ---------------------------------------------------------------------------

/**
 * Get the current user's challenge usage / limit info derived from their
 * subscription tier and premium features.
 * Requires authentication.
 *
 * Internally calls GET /api/subscriptions/status and extracts limit info.
 */
export async function getChallengeLimit(): Promise<ChallengeLimit> {
  const status = await getSubscriptionStatus();

  const isPro = status.tier === 'pro' && status.features.unlimitedChallenges;
  const allowed = isPro ? Infinity : FREE_CHALLENGE_LIMIT;

  // The server does not expose a "used" count directly from this endpoint,
  // so we default to 0 and let the caller reconcile with actual usage data.
  const used = 0;
  const remaining = isPro ? Infinity : Math.max(0, allowed - used);

  return { allowed, used, remaining, isPro };
}
