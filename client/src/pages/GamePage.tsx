/**
 * GamePage -- the core game experience.
 *
 * Displays the current active round's AI-generated image prominently and
 * manages five distinct view states:
 *
 *  1. Loading        -- spinner while fetching the active round
 *  2. Error          -- fetch error with retry button
 *  3. No active round -- friendly empty state
 *  4. Active round   -- image hero + guess form (or score result)
 *     4a. Not guessed yet (authenticated) -- guess input form
 *     4b. Already guessed (authenticated)  -- ScoreDisplay + leaderboard link
 *  5. Not authenticated -- image displayed with login/register CTA
 */

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getActiveRound, submitGuess } from '../services/game';
import type { Round, GuessResult } from '../types/game';
import { ApiRequestError } from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import EmptyState from '../components/EmptyState';
import ScoreDisplay from '../components/ScoreDisplay';

export default function GamePage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  // Round data
  const [loading, setLoading] = useState(true);
  const [round, setRound] = useState<Round | null>(null);
  const [hasGuessed, setHasGuessed] = useState(false);
  const [userScore, setUserScore] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Guess submission state
  const [guessText, setGuessText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [guessResult, setGuessResult] = useState<GuessResult | null>(null);

  const fetchRound = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getActiveRound();
      setRound(data.round ?? null);
      setHasGuessed(data.hasGuessed ?? false);
      setUserScore(data.userScore ?? null);
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 404) {
        // No active round -- not an error, just empty state
        setRound(null);
      } else {
        setError(
          err instanceof Error ? err.message : 'Failed to load the current round.',
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Wait for auth to settle before fetching to get user-specific data
    if (!authLoading) {
      fetchRound();
    }
  }, [authLoading, fetchRound]);

  // Handle guess submission
  const handleSubmitGuess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!round || !guessText.trim() || submitting) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const result = await submitGuess(round.id, guessText.trim());
      setGuessResult(result);
      setHasGuessed(true);
      setUserScore(result.score);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        if (err.status === 409) {
          setSubmitError('You have already submitted a guess for this round.');
          setHasGuessed(true);
        } else if (err.status === 400) {
          setSubmitError('This round is no longer active.');
        } else {
          setSubmitError(err.message || 'Something went wrong. Please try again.');
        }
      } else {
        setSubmitError('Something went wrong. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // -----------------------------------------------------------------------
  // Render: Loading
  // -----------------------------------------------------------------------
  if (loading || authLoading) {
    return (
      <div className="game-page">
        <LoadingSpinner message="Loading round..." />
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Render: Error
  // -----------------------------------------------------------------------
  if (error) {
    return (
      <div className="game-page">
        <ErrorMessage message={error} onRetry={fetchRound} />
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Render: No active round
  // -----------------------------------------------------------------------
  if (!round) {
    return (
      <div className="game-page">
        <EmptyState
          title="No Active Round"
          message="Check back soon for the next round!"
        />
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Render: Active round
  // -----------------------------------------------------------------------
  const alreadyGuessed = hasGuessed || guessResult !== null;

  return (
    <div className="game-page">
      {/* Hero image */}
      <div className="game-image-container">
        {round.imageUrl ? (
          <img
            src={round.imageUrl}
            alt="AI-generated image for this round"
            className="game-image"
          />
        ) : (
          <div className="game-image-placeholder">
            <span>Image loading...</span>
          </div>
        )}
      </div>

      {/* Round info */}
      <div className="game-round-info">
        <span className="game-guess-count">
          {round.guessCount} {round.guessCount === 1 ? 'player has' : 'players have'} guessed
        </span>
      </div>

      {/* ---- State: Not authenticated ---- */}
      {!isAuthenticated && (
        <div className="game-auth-cta">
          <p className="game-auth-cta-text">
            Sign in to submit your guess and compete!
          </p>
          <div className="game-auth-cta-actions">
            <Link to="/login" className="btn btn-primary">
              Log In
            </Link>
            <Link to="/register" className="btn btn-outline">
              Register
            </Link>
          </div>
        </div>
      )}

      {/* ---- State: Authenticated, already guessed ---- */}
      {isAuthenticated && alreadyGuessed && (
        <div className="game-result">
          {guessResult ? (
            <ScoreDisplay
              score={guessResult.score ?? 0}
              rank={guessResult.rank}
              totalGuesses={guessResult.totalGuesses}
            />
          ) : userScore !== null && userScore !== undefined ? (
            <div className="game-result-summary">
              <div className="game-result-score-label">Your score</div>
              <div className="game-result-score-value">{userScore}</div>
            </div>
          ) : (
            <p className="game-result-submitted">
              You have already submitted a guess for this round.
            </p>
          )}
          <Link
            to={`/rounds/${round.id}/leaderboard`}
            className="btn btn-outline game-leaderboard-link"
          >
            View Leaderboard
          </Link>
        </div>
      )}

      {/* ---- State: Authenticated, not yet guessed ---- */}
      {isAuthenticated && !alreadyGuessed && (
        <form className="game-guess-form" onSubmit={handleSubmitGuess}>
          <div className="form-group">
            <label htmlFor="guess-input">What prompt generated this image?</label>
            <input
              id="guess-input"
              type="text"
              className={`game-guess-input${submitError ? ' input-error' : ''}`}
              placeholder="Enter your guess..."
              value={guessText}
              onChange={(e) => setGuessText(e.target.value)}
              maxLength={200}
              disabled={submitting}
              autoComplete="off"
            />
            <div className="game-guess-meta">
              <span className="game-guess-char-count">
                {guessText.length}/200
              </span>
            </div>
          </div>

          {submitError && (
            <div className="game-guess-error">{submitError}</div>
          )}

          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={submitting || !guessText.trim()}
          >
            {submitting ? 'Submitting...' : 'Submit Guess'}
          </button>
        </form>
      )}
    </div>
  );
}
