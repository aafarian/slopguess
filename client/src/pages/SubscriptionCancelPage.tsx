/**
 * Subscription cancel page -- Stripe Checkout redirects here when the user
 * cancels or dismisses the payment flow. Shows a friendly message and links
 * back to pricing or the game. Auto-redirects to home after 10 seconds.
 */

import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

export default function SubscriptionCancelPage() {
  const navigate = useNavigate();
  const [secondsLeft, setSecondsLeft] = useState(10);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
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
  }, [navigate]);

  return (
    <div className="subscription-result-page">
      <div className="subscription-result-card">
        <div className="subscription-result-icon subscription-result-icon--cancel">
          &larr;
        </div>

        <h1 className="subscription-result-title">No Worries!</h1>

        <p className="subscription-result-subtitle">
          You can upgrade to Slop Guess Pro anytime. All free features are still
          available.
        </p>

        <div className="subscription-result-actions">
          <Link to="/pricing" className="btn btn-primary">
            View Plans
          </Link>
          <Link to="/" className="btn btn-outline">
            Back to Game
          </Link>
        </div>

        <p className="subscription-result-redirect">
          Redirecting to game in {secondsLeft}s&hellip;
        </p>
      </div>
    </div>
  );
}
