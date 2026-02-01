/**
 * GamePage -- the core game experience.
 *
 * Displays the current active round's AI-generated image prominently and
 * manages distinct view states:
 *
 *  1. Loading        -- spinner while fetching the active round
 *  2. Error          -- fetch error with retry button
 *  3. No active round -- friendly empty state
 *  4. Active round   -- image hero + guess form (or score result)
 *     4a. Not guessed yet (authenticated) -- GuessForm component
 *     4b. Analyzing  (brief transition)    -- "Analyzing your guess..."
 *     4c. Already guessed (authenticated)  -- ScoreDisplay + links
 *  5. Not authenticated -- image displayed with login/register CTA
 */

import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getActiveRound } from '../services/game';
import type { Round, GuessResult } from '../types/game';
import { ApiRequestError } from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import EmptyState from '../components/EmptyState';
import ScoreDisplay from '../components/ScoreDisplay';
import GuessForm from '../components/GuessForm';

/** Duration of the "Analyzing your guess..." transition in ms. */
const ANALYZING_DELAY_MS = 1200;

type SubmissionPhase = 'idle' | 'analyzing' | 'revealed';

export default function GamePage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();

  // Round data
  const [loading, setLoading] = useState(true);
  const [round, setRound] = useState<Round | null>(null);
  const [hasGuessed, setHasGuessed] = useState(false);
  const [userScore, setUserScore] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Guess submission state
  const [guessResult, setGuessResult] = useState<GuessResult | null>(null);
  const [submissionPhase, setSubmissionPhase] = useState<SubmissionPhase>('idle');
  const [roundEnded, setRoundEnded] = useState(false);

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

  // Handle successful guess submission with analyzing transition
  const handleGuessSuccess = useCallback((result: GuessResult) => {
    setGuessResult(result);
    setSubmissionPhase('analyzing');

    // Brief "Analyzing..." state before revealing score
    setTimeout(() => {
      setSubmissionPhase('revealed');
      setHasGuessed(true);
      setUserScore(result.score);
    }, ANALYZING_DELAY_MS);
  }, []);

  // Handle duplicate guess (already submitted)
  const handleAlreadyGuessed = useCallback(() => {
    setHasGuessed(true);
  }, []);

  // Handle round ended while user was typing
  const handleRoundEnded = useCallback(() => {
    setRoundEnded(true);
  }, []);

  // Handle unauthenticated user trying to play -- redirect with return URL
  const handleLoginRedirect = useCallback(() => {
    const returnUrl = encodeURIComponent(window.location.pathname);
    navigate(`/login?returnTo=${returnUrl}`);
  }, [navigate]);

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
  // Render: Round ended while user was typing
  // -----------------------------------------------------------------------
  if (roundEnded) {
    return (
      <div className="game-page">
        {/* Still show the image */}
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
        <div className="game-round-ended-notice">
          <div className="game-round-ended-icon" aria-hidden="true">
            &#9201;
          </div>
          <h2 className="game-round-ended-title">Round Has Ended</h2>
          <p className="game-round-ended-text">
            This round is no longer accepting guesses. Check back for the next one!
          </p>
          <div className="game-round-ended-actions">
            <Link to={`/rounds/${round.id}`} className="btn btn-outline">
              View Round Details
            </Link>
            <button className="btn btn-primary" onClick={fetchRound}>
              Check for New Round
            </button>
          </div>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Render: Active round
  // -----------------------------------------------------------------------
  const alreadyGuessed = hasGuessed || submissionPhase === 'revealed';
  const isAnalyzing = submissionPhase === 'analyzing';

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
            <button onClick={handleLoginRedirect} className="btn btn-primary">
              Log In
            </button>
            <Link to="/register" className="btn btn-outline">
              Register
            </Link>
          </div>
        </div>
      )}

      {/* ---- State: Analyzing (transition) ---- */}
      {isAuthenticated && isAnalyzing && (
        <div className="game-analyzing">
          <div className="game-analyzing-spinner" />
          <p className="game-analyzing-text">Analyzing your guess...</p>
        </div>
      )}

      {/* ---- State: Authenticated, score revealed ---- */}
      {isAuthenticated && alreadyGuessed && !isAnalyzing && (
        <div className="game-result game-result--fade-in">
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
          <div className="game-result-links">
            <Link
              to={`/rounds/${round.id}/leaderboard`}
              className="btn btn-primary game-result-link"
            >
              View Leaderboard
            </Link>
            <Link
              to={`/rounds/${round.id}`}
              className="btn btn-outline game-result-link"
            >
              View Round Details
            </Link>
          </div>
        </div>
      )}

      {/* ---- State: Authenticated, not yet guessed ---- */}
      {isAuthenticated && !alreadyGuessed && !isAnalyzing && (
        <GuessForm
          roundId={round.id}
          onSuccess={handleGuessSuccess}
          onAlreadyGuessed={handleAlreadyGuessed}
          onRoundEnded={handleRoundEnded}
        />
      )}
    </div>
  );
}
