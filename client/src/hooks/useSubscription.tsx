/**
 * Subscription context and hook.
 *
 * Wrap the app in <SubscriptionProvider> (inside AuthProvider) and call
 * useSubscription() in any component to access the current subscription tier,
 * premium features, and checkout action.
 *
 * The provider fetches subscription status on mount when authenticated and
 * polls every 60 seconds to pick up server-side tier changes (e.g. from
 * Stripe webhooks).
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import type {
  SubscriptionTier,
  PremiumFeatures,
} from '../types/subscription';
import * as subscriptionService from '../services/subscription';
import { useAuth } from './useAuth';

/** How often (ms) to re-fetch subscription status while authenticated. */
const POLL_INTERVAL_MS = 60_000;

/** Default premium features for unauthenticated / free-tier users. */
const DEFAULT_FEATURES: PremiumFeatures = {
  adFree: false,
  proBadge: false,
};

interface SubscriptionContextValue {
  /** Current subscription tier. */
  tier: SubscriptionTier;
  /** Convenience boolean -- true when tier is 'pro'. */
  isPro: boolean;
  /** Feature flags derived from the subscription tier. */
  premiumFeatures: PremiumFeatures;
  /** True while the initial fetch is in flight. */
  loading: boolean;
  /** Error message from the last failed fetch, or null. */
  error: string | null;
  /** Start a Stripe Checkout session and redirect. */
  startCheckout: () => Promise<void>;
  /** Manually re-fetch subscription status from the server. */
  refreshSubscription: () => Promise<void>;
  /** Whether monetization features are enabled on the server. */
  monetizationEnabled: boolean;
}

const SubscriptionContext = createContext<SubscriptionContextValue | undefined>(
  undefined,
);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const [tier, setTier] = useState<SubscriptionTier>('free');
  const [premiumFeatures, setPremiumFeatures] =
    useState<PremiumFeatures>(DEFAULT_FEATURES);
  const [monetizationEnabled, setMonetizationEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track whether the component is still mounted to prevent state updates
  // after unmount.
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ------------------------------------------------------------------
  // Core fetch
  // ------------------------------------------------------------------

  const fetchStatus = useCallback(async () => {
    try {
      const status = await subscriptionService.getSubscriptionStatus();

      if (!mountedRef.current) return;

      setMonetizationEnabled(status.monetizationEnabled);
      setTier(status.tier);
      setPremiumFeatures(status.features);
      setError(null);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to load subscription');
    }
  }, []);

  // ------------------------------------------------------------------
  // Fetch on mount & poll while authenticated
  // ------------------------------------------------------------------

  useEffect(() => {
    if (!user) {
      // Reset to defaults when logged out
      setTier('free');
      setPremiumFeatures(DEFAULT_FEATURES);
      setMonetizationEnabled(false);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;

    async function initialFetch() {
      setLoading(true);
      try {
        const status = await subscriptionService.getSubscriptionStatus();

        if (cancelled) return;

        setMonetizationEnabled(status.monetizationEnabled);
        setTier(status.tier);
        setPremiumFeatures(status.features);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load subscription');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    initialFetch();

    // Poll every 60s so webhook-driven tier changes propagate to the client.
    const intervalId = setInterval(() => {
      if (!cancelled) fetchStatus();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [user, fetchStatus]);

  // ------------------------------------------------------------------
  // Actions
  // ------------------------------------------------------------------

  const startCheckout = useCallback(async () => {
    await subscriptionService.startCheckout();
  }, []);

  const refreshSubscription = useCallback(async () => {
    await fetchStatus();
  }, [fetchStatus]);

  // ------------------------------------------------------------------
  // Derived state
  // ------------------------------------------------------------------

  const isPro = monetizationEnabled && tier === 'pro';

  // ------------------------------------------------------------------
  // Provider value
  // ------------------------------------------------------------------

  const value: SubscriptionContextValue = {
    tier,
    isPro,
    premiumFeatures,
    loading,
    error,
    startCheckout,
    refreshSubscription,
    monetizationEnabled,
  };

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}

/**
 * Hook to access subscription state and actions.
 * Must be used within a SubscriptionProvider (which must be inside AuthProvider).
 */
export function useSubscription(): SubscriptionContextValue {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) {
    throw new Error(
      'useSubscription must be used within a SubscriptionProvider',
    );
  }
  return ctx;
}
