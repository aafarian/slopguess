/**
 * Subscription context and hook.
 *
 * Wrap the app in <SubscriptionProvider> (inside AuthProvider) and call
 * useSubscription() in any component to access the current subscription tier,
 * premium features, challenge limits, and checkout/portal actions.
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
  ChallengeLimit,
} from '../types/subscription';
import * as subscriptionService from '../services/subscription';
import { useAuth } from './useAuth';

/** How often (ms) to re-fetch subscription status while authenticated. */
const POLL_INTERVAL_MS = 60_000;

/** Default premium features for unauthenticated / free-tier users. */
const DEFAULT_FEATURES: PremiumFeatures = {
  unlimitedChallenges: false,
  proBadge: false,
  detailedAnalytics: false,
  adFree: false,
  priorityImageGen: false,
};

/** Default challenge limit for unauthenticated / free-tier users. */
const DEFAULT_CHALLENGE_LIMIT: ChallengeLimit = {
  allowed: 3,
  used: 0,
  remaining: 3,
  isPro: false,
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
  /** Open the Stripe Customer Portal and redirect. */
  openPortal: () => Promise<void>;
  /** Current challenge usage / limit info. */
  challengeLimit: ChallengeLimit;
  /** Whether the user can still send challenges today. */
  canSendChallenge: boolean;
  /** Manually re-fetch subscription status from the server. */
  refreshSubscription: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextValue | undefined>(
  undefined,
);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const [tier, setTier] = useState<SubscriptionTier>('free');
  const [premiumFeatures, setPremiumFeatures] =
    useState<PremiumFeatures>(DEFAULT_FEATURES);
  const [challengeLimit, setChallengeLimit] =
    useState<ChallengeLimit>(DEFAULT_CHALLENGE_LIMIT);
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
      const [status, limit] = await Promise.all([
        subscriptionService.getSubscriptionStatus(),
        subscriptionService.getChallengeLimit(),
      ]);

      if (!mountedRef.current) return;

      setTier(status.tier);
      setPremiumFeatures(status.features);
      setChallengeLimit(limit);
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
      setChallengeLimit(DEFAULT_CHALLENGE_LIMIT);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;

    async function initialFetch() {
      setLoading(true);
      try {
        const [status, limit] = await Promise.all([
          subscriptionService.getSubscriptionStatus(),
          subscriptionService.getChallengeLimit(),
        ]);

        if (cancelled) return;

        setTier(status.tier);
        setPremiumFeatures(status.features);
        setChallengeLimit(limit);
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

  const openPortal = useCallback(async () => {
    await subscriptionService.openCustomerPortal();
  }, []);

  const refreshSubscription = useCallback(async () => {
    await fetchStatus();
  }, [fetchStatus]);

  // ------------------------------------------------------------------
  // Derived state
  // ------------------------------------------------------------------

  const isPro = tier === 'pro';
  const canSendChallenge = challengeLimit.isPro || challengeLimit.remaining > 0;

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
    openPortal,
    challengeLimit,
    canSendChallenge,
    refreshSubscription,
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
