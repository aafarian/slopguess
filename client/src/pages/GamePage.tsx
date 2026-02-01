/**
 * GamePage -- the core game experience.
 *
 * Desktop: side-by-side layout (image left, controls right)
 * Mobile:  stacked layout (image top, controls below)
 *
 * View states:
 *  1. Loading        -- spinner while fetching the active round
 *  2. Error          -- fetch error with retry button
 *  3. No active round -- friendly empty state
 *  4. Active round   -- image + guess form (or score result)
 *     4a. Not guessed yet (authenticated) -- GuessForm component
 *     4b. Analyzing  (brief transition)    -- "Analyzing your guess..."
 *     4c. Already guessed (authenticated)  -- ScoreDisplay + prompt reveal
 *  5. Not authenticated -- image displayed with login/register CTA
 */

import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getActiveRound } from '../services/game';
import type { Round, GuessResult } from '../types/game';
import { ApiRequestError } from '../services/api';
import { GamePageSkeleton } from '../components/SkeletonLoader';
import ErrorMessage from '../components/ErrorMessage';
import EmptyState from '../components/EmptyState';
import ScoreDisplay from '../components/ScoreDisplay';
import GuessForm from '../components/GuessForm';
import ElementBreakdown from '../components/ElementBreakdown';
import ShareButton from '../components/ShareButton';

/** Duration of the "Analyzing your guess..." transition in ms. */
const ANALYZING_DELAY_MS = 1200;

type SubmissionPhase = 'idle' | 'analyzing' | 'revealed';

export default function GamePage() {
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
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
    if (!authLoading) {
      fetchRound();
    }
  }, [authLoading, fetchRound]);

  const handleGuessSuccess = useCallback((result: GuessResult) => {
    setGuessResult(result);
    setSubmissionPhase('analyzing');

    setTimeout(() => {
      setSubmissionPhase('revealed');
      setHasGuessed(true);
      setUserScore(result.score);
    }, ANALYZING_DELAY_MS);
  }, []);

  const handleAlreadyGuessed = useCallback(() => {
    setHasGuessed(true);
  }, []);

  const handleRoundEnded = useCallback(() => {
    setRoundEnded(true);
  }, []);

  const handleLoginRedirect = useCallback(() => {
    const returnUrl = encodeURIComponent(window.location.pathname);
    navigate(`/login?returnTo=${returnUrl}`);
  }, [navigate]);

  // -----------------------------------------------------------------------
  // Render: Loading
  // -----------------------------------------------------------------------
  if (loading || authLoading) {
    return <GamePageSkeleton />;
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
        <div className="game-layout">
          <div className="game-image-panel">
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
          <div className="game-controls-panel">
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
      <div className="game-layout">
        {/* Left panel: Image */}
        <div className="game-image-panel">
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

        {/* Right panel: Controls */}
        <div className="game-controls-panel">
          {/* Round info */}
          <div className="game-round-info">
            <span className="game-guess-count">
              {round.guessCount} {round.guessCount === 1 ? 'player has' : 'players have'} guessed
            </span>
            {round.difficulty && round.difficulty !== 'normal' && (
              <span className={`game-difficulty-badge game-difficulty-badge--${round.difficulty}`}>
                {round.difficulty}
              </span>
            )}
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
                <>
                  <ScoreDisplay
                    score={guessResult.score ?? 0}
                    rank={guessResult.rank}
                    totalGuesses={guessResult.totalGuesses}
                  />
                  {guessResult.elementScores && (
                    <ElementBreakdown
                      elementScores={guessResult.elementScores}
                      promptWords={guessResult.prompt?.split(/\s+/).filter(Boolean)}
                    />
                  )}
                </>
              ) : userScore !== null && userScore !== undefined ? (
                <div className="game-result-summary">
                  <div className="game-result-score-label">Your score</div>
                  <div className="game-result-score-value">{userScore}</div>
                  {user && (
                    <ShareButton
                      score={userScore}
                      rank={0}
                      totalGuesses={round.guessCount}
                      roundId={round.id}
                      userId={user.id}
                    />
                  )}
                </div>
              ) : (
                <p className="game-result-submitted">
                  You have already submitted a guess for this round.
                </p>
              )}

              {/* Show the prompt — from guess response or from round data on refresh */}
              {(guessResult?.prompt || round.prompt) && (
                <div className="game-prompt-reveal">
                  <span className="game-prompt-reveal-label">The prompt was</span>
                  <p className="game-prompt-reveal-text">{guessResult?.prompt || round.prompt}</p>
                </div>
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
                  Round Details
                </Link>
                {guessResult && user && (
                  <ShareButton
                    score={guessResult.score ?? 0}
                    rank={guessResult.rank}
                    totalGuesses={guessResult.totalGuesses}
                    roundId={round.id}
                    userId={user.id}
                  />
                )}
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
      </div>
    </div>
  );
}
