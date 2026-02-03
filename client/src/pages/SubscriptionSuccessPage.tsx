/**
 * Subscription success page -- Stripe Checkout redirects here after payment.
 * Refreshes subscription state, shows unlocked features, and auto-redirects
 * to home after 10 seconds.
 */

import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSubscription } from '../hooks/useSubscription';

export default function SubscriptionSuccessPage() {
  const navigate = useNavigate();
  const { refreshSubscription } = useSubscription();
  const [secondsLeft, setSecondsLeft] = useState(10);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Refresh subscription state so the rest of the app picks up the new tier.
    refreshSubscription();

    // Auto-redirect to home after 10 seconds.
    timerRef.current = setTimeout(() => {
      navigate('/');
    }, 10_000);

    // Countdown display.
    countdownRef.current = setInterval(() => {
      setSecondsLeft((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1_000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [navigate, refreshSubscription]);

  return (
    <div className="subscription-result-page">
      <div className="subscription-result-card">
        <div className="subscription-result-icon subscription-result-icon--success">
          &#10003;
        </div>

        <h1 className="subscription-result-title">Your purchase is complete!</h1>

        <p className="subscription-result-subtitle">
          Welcome to Slop Guess Pro. Here&apos;s what you&apos;ve unlocked:
        </p>

        <ul className="subscription-features-list">
          <li>Ad-free experience</li>
          <li>Pro badge on your profile</li>
        </ul>

        <div className="subscription-result-actions">
          <Link to="/" className="btn btn-primary">
            Start Playing
          </Link>
        </div>

        <p className="subscription-result-redirect">
          Redirecting to game in {secondsLeft}s&hellip;
        </p>
      </div>
    </div>
  );
}
