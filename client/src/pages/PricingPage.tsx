/**
 * PricingPage -- upgrade / plan selection page.
 *
 * Route: /pricing
 *
 * Shows two plan cards side-by-side: Free and Pro.
 * - Free plan lists included features (with ads).
 * - Pro plan lists premium features: ad-free + Pro badge for $5 one-time.
 * - If the user is already Pro, the Pro card shows a "Current Plan" badge.
 * - If the user is not logged in, shows a login prompt instead of the CTA.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useSubscription } from '../hooks/useSubscription';
import { PRO_PRICE, PRO_PLAN_NAME } from '../types/subscription';

/* -----------------------------------------------------------------------
   Feature list definitions
   ----------------------------------------------------------------------- */

/** Features shared by both Free and Pro plans. */
const BASE_FEATURES = [
  'Daily game',
  'Leaderboard access',
  'Friends list',
  'Unlimited challenges',
];

/** Free-only feature callouts. */
const FREE_ONLY_FEATURES = ['Ad-supported'];

/** Pro-exclusive feature callouts. */
const PRO_FEATURES = [
  'Ad-free experience',
  'Pro badge',
];

/* -----------------------------------------------------------------------
   Component
   ----------------------------------------------------------------------- */

export default function PricingPage() {
  const { isAuthenticated } = useAuth();
  const { isPro, startCheckout, loading, monetizationEnabled } = useSubscription();

  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpgrade() {
    setError(null);
    setCheckoutLoading(true);
    try {
      await startCheckout();
    } catch {
      setError('Failed to start checkout. Please try again.');
    } finally {
      setCheckoutLoading(false);
    }
  }

  if (!monetizationEnabled) {
    return (
      <div className="pricing-page">
        <div className="pricing-header">
          <h1 className="pricing-title">Coming Soon</h1>
          <p className="pricing-subtitle">
            Premium plans are not yet available. Stay tuned!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="pricing-page">
      <div className="pricing-header">
        <h1 className="pricing-title">Choose Your Plan</h1>
        <p className="pricing-subtitle">
          Unlock the full Slop Guess experience with {PRO_PLAN_NAME}.
        </p>
      </div>

      {error && (
        <div className="pricing-error">
          <p>{error}</p>
        </div>
      )}

      <div className="pricing-cards">
        {/* ---- Free Plan Card ---- */}
        <div
          className={`pricing-card ${!isPro && isAuthenticated ? 'pricing-card--current' : ''}`}
        >
          {!isPro && isAuthenticated && (
            <span className="pricing-card-badge">Current Plan</span>
          )}

          <div className="pricing-card-header">
            <h2 className="pricing-card-name">Free</h2>
            <div className="pricing-card-price">
              <span className="pricing-card-amount">$0</span>
            </div>
          </div>

          <ul className="pricing-card-features">
            {[...BASE_FEATURES, ...FREE_ONLY_FEATURES].map((feature) => (
              <li key={feature} className="pricing-card-feature">
                <span className="pricing-card-feature-icon">&#10003;</span>
                {feature}
              </li>
            ))}
          </ul>

          <div className="pricing-card-actions">
            {!isPro && isAuthenticated && (
              <span className="pricing-card-current-label">Your current plan</span>
            )}
          </div>
        </div>

        {/* ---- Pro Plan Card ---- */}
        <div
          className={`pricing-card pricing-card--pro ${isPro ? 'pricing-card--current' : ''}`}
        >
          {isPro && (
            <span className="pricing-card-badge">Current Plan</span>
          )}

          <div className="pricing-card-header">
            <h2 className="pricing-card-name">{PRO_PLAN_NAME}</h2>
            <div className="pricing-card-price">
              <span className="pricing-card-amount">{PRO_PRICE}</span>
              <span className="pricing-card-period">one-time</span>
            </div>
          </div>

          <ul className="pricing-card-features">
            {BASE_FEATURES.map((feature) => (
              <li key={feature} className="pricing-card-feature">
                <span className="pricing-card-feature-icon">&#10003;</span>
                {feature}
              </li>
            ))}
            {PRO_FEATURES.map((feature) => (
              <li key={feature} className="pricing-card-feature pricing-card-feature--pro">
                <span className="pricing-card-feature-icon pricing-card-feature-icon--pro">
                  &#9733;
                </span>
                {feature}
              </li>
            ))}
          </ul>

          <div className="pricing-card-actions">
            {!isAuthenticated && (
              <Link
                to="/login?returnTo=%2Fpricing"
                className="btn btn-primary btn-block"
              >
                Log in to upgrade
              </Link>
            )}

            {isAuthenticated && !isPro && (
              <button
                type="button"
                className="btn btn-primary btn-block"
                disabled={checkoutLoading || loading}
                onClick={handleUpgrade}
              >
                {checkoutLoading ? 'Redirecting...' : 'Buy Now'}
              </button>
            )}

            {isAuthenticated && isPro && (
              <span className="pricing-card-current-label">You own this</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
