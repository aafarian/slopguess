/**
 * Subscription service — typed wrappers around the /api/subscriptions endpoints.
 */

import { request } from './api';
import type {
  SubscriptionStatusResponse,
  CheckoutResponse,
} from '../types/subscription';

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
