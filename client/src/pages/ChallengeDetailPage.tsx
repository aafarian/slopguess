/**
 * ChallengeDetailPage -- detail view for a single challenge.
 *
 * Route: /challenges/:challengeId (requires authentication)
 *
 * View states:
 *  1. Loading        -- spinner while fetching the challenge
 *  2. Error          -- fetch error with retry button
 *  3. Not found      -- challenge not found (404)
 *  4. Active (challenged user, not guessed) -- image + guess form
 *  5. Results        -- scores, prompt reveal, guess display
 *
 * The "Challenge Back" button navigates to the create form
 * pre-filled with the same friend.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import {
  getChallengeDetail,
  submitChallengeGuess,
} from '../services/social';
import { ApiRequestError } from '../services/api';
import type { Challenge } from '../types/social';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';

const MAX_GUESS_CHARS = 200;

/** Duration of the "Analyzing your guess..." transition in ms. */
const ANALYZING_DELAY_MS = 1200;

type SubmissionPhase = 'idle' | 'analyzing' | 'revealed';

/** Score color helper. */
function getScoreColorClass(score: number | null): string {
  if (score === null) return '';
  if (score >= 80) return 'score-excellent';
  if (score >= 50) return 'score-good';
  if (score >= 25) return 'score-decent';
  return 'score-low';
}

/** Score label helper. */
function getScoreLabel(score: number): string {
  if (score >= 80) return 'Excellent!';
  if (score >= 50) return 'Good';
  if (score >= 25) return 'Decent';
  return 'Keep trying';
}

/** Map API error codes to user-friendly messages. */
function getGuessErrorMessage(err: unknown): string {
  if (err instanceof ApiRequestError) {
    switch (err.status) {
      case 409:
        return "You've already submitted a guess for this challenge.";
      case 400:
        return err.message || 'Invalid request. Please check your guess.';
      case 404:
        return 'Challenge not found.';
      default:
        return err.message || 'Something went wrong. Please try again.';
    }
  }
  return 'Something went wrong. Please try again.';
}

export default function ChallengeDetailPage() {
  const { challengeId } = useParams<{ challengeId: string }>();
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();

  // Challenge data
  const [loading, setLoading] = useState(true);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);

  // Guess form state
  const [guessText, setGuessText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submissionPhase, setSubmissionPhase] = useState<SubmissionPhase>('idle');
  const submittedRef = useRef(false);

  const fetchChallenge = useCallback(async () => {
    if (!challengeId) return;
    setLoading(true);
    setError('');
    setNotFound(false);
    try {
      const res = await getChallengeDetail(challengeId);
      setChallenge(res.challenge);
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 404) {
        setNotFound(true);
      } else {
        setError(
          err instanceof Error ? err.message : 'Failed to load challenge.',
        );
      }
    } finally {
      setLoading(false);
    }
  }, [challengeId]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchChallenge();
    }
  }, [isAuthenticated, fetchChallenge]);

  // Guess submission
  const charCount = guessText.length;
  const isNearLimit = charCount >= 180;
  const isAtLimit = charCount >= MAX_GUESS_CHARS;
  const trimmedGuess = guessText.trim();
  const canSubmit =
    trimmedGuess.length > 0 && !submitting && !submittedRef.current;

  const handleGuessSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!canSubmit || !challengeId) return;
      if (submittedRef.current) return;

      setSubmitting(true);
      setSubmitError(null);

      try {
        const res = await submitChallengeGuess(challengeId, trimmedGuess);
        submittedRef.current = true;
        setSubmissionPhase('analyzing');

        setTimeout(() => {
          setSubmissionPhase('revealed');
          setChallenge(res.challenge);
        }, ANALYZING_DELAY_MS);
      } catch (err) {
        const message = getGuessErrorMessage(err);
        setSubmitError(message);

        // If already guessed, refetch to get the results
        if (err instanceof ApiRequestError && err.status === 409) {
          submittedRef.current = true;
          fetchChallenge();
        }
      } finally {
        setSubmitting(false);
      }
    },
    [canSubmit, challengeId, trimmedGuess, fetchChallenge],
  );

  // Navigate to create form pre-filled with the opponent
  const handleChallengeBack = useCallback(() => {
    if (!challenge || !user) return;
    const opponentId =
      challenge.challengerId === user.id
        ? challenge.challengedId
        : challenge.challengerId;
    navigate(`/challenges?friendId=${opponentId}`);
  }, [challenge, user, navigate]);

  // Unauthenticated CTA
  if (!isAuthenticated) {
    return (
      <div className="challenge-detail">
        <div className="game-auth-cta">
          <p className="game-auth-cta-text">
            Sign in to view this challenge.
          </p>
          <div className="game-auth-cta-actions">
            <Link
              to={`/login?returnTo=${encodeURIComponent(window.location.pathname)}`}
              className="btn btn-primary"
            >
              Log In
            </Link>
            <Link to="/register" className="btn btn-outline">
              Register
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Loading
  if (loading) {
    return (
      <div className="challenge-detail">
        <LoadingSpinner message="Loading challenge..." />
      </div>
    );
  }

  // Error
  if (error) {
    return (
      <div className="challenge-detail">
        <ErrorMessage message={error} onRetry={fetchChallenge} />
      </div>
    );
  }

  // Not found
  if (notFound || !challenge) {
    return (
      <div className="challenge-detail">
        <div className="challenge-detail-not-found">
          <h2 className="challenge-detail-not-found-title">
            Challenge Not Found
          </h2>
          <p className="challenge-detail-not-found-text">
            This challenge may have been removed or you don't have access.
          </p>
          <Link to="/challenges" className="btn btn-primary">
            Back to Challenges
          </Link>
        </div>
      </div>
    );
  }

  // Determine user role in this challenge
  const isChallenger = user?.id === challenge.challengerId;
  const isChallenged = user?.id === challenge.challengedId;
  const opponentUsername = isChallenger
    ? challenge.challengedUsername
    : challenge.challengerUsername;

  // Determine if results should be shown
  const hasGuessed =
    challenge.status === 'guessed' ||
    challenge.status === 'completed' ||
    submissionPhase === 'revealed';
  const showGuessForm =
    isChallenged &&
    challenge.status === 'active' &&
    submissionPhase === 'idle' &&
    !submittedRef.current;
  const isAnalyzing = submissionPhase === 'analyzing';

  return (
    <div className="challenge-detail">
      {/* Back link */}
      <div className="challenge-detail-back">
        <Link to="/challenges" className="challenge-detail-back-link">
          &larr; All Challenges
        </Link>
      </div>

      {/* Opponent info */}
      <div className="challenge-detail-opponent-info">
        <span className="challenge-detail-opponent-label">
          {isChallenger ? 'You challenged' : 'Challenged by'}
        </span>
        <span className="challenge-detail-opponent-name">
          {opponentUsername}
        </span>
      </div>

      {/* Image display */}
      <div className="challenge-detail-image-container">
        {challenge.imageUrl ? (
          <img
            src={challenge.imageUrl}
            alt="Challenge AI-generated image"
            className="challenge-detail-image"
          />
        ) : (
          <div className="challenge-detail-image-placeholder">
            <span>Image generating...</span>
          </div>
        )}
      </div>

      {/* ---- State: Analyzing (transition) ---- */}
      {isAnalyzing && (
        <div className="game-analyzing">
          <div className="game-analyzing-spinner" />
          <p className="game-analyzing-text">Analyzing your guess...</p>
        </div>
      )}

      {/* ---- State: Guess form (challenged user, active challenge) ---- */}
      {showGuessForm && (
        <div className="challenge-detail-guess-section">
          <h2 className="challenge-detail-section-title">
            What prompt generated this image?
          </h2>
          <form className="game-guess-form" onSubmit={handleGuessSubmit}>
            <div className="form-group">
              <div className="game-guess-input-wrapper">
                <input
                  id="challenge-guess-input"
                  type="text"
                  className={`game-guess-input${submitError ? ' input-error' : ''}${submitting ? ' game-guess-input--disabled' : ''}`}
                  placeholder="What do you think the prompt was?"
                  value={guessText}
                  onChange={(e) => {
                    setGuessText(e.target.value);
                    if (submitError) setSubmitError(null);
                  }}
                  maxLength={MAX_GUESS_CHARS}
                  disabled={submitting}
                  autoComplete="off"
                />
              </div>
              <div className="game-guess-meta">
                <span
                  className={`game-guess-char-count${isAtLimit ? ' game-guess-char-count--limit' : isNearLimit ? ' game-guess-char-count--near' : ''}`}
                >
                  {charCount}/{MAX_GUESS_CHARS}
                </span>
              </div>
            </div>

            {submitError && (
              <div className="game-guess-error" role="alert">
                {submitError}
              </div>
            )}

            <button
              type="submit"
              className={`btn btn-primary btn-block game-guess-submit${submitting ? ' game-guess-submit--loading' : ''}`}
              disabled={!canSubmit}
            >
              {submitting ? (
                <>
                  <span
                    className="game-guess-submit-spinner"
                    aria-hidden="true"
                  />
                  Submitting...
                </>
              ) : (
                'Submit Guess'
              )}
            </button>
          </form>
        </div>
      )}

      {/* ---- State: Results (guessed / completed / challenger view) ---- */}
      {hasGuessed && !isAnalyzing && (
        <div className="challenge-detail-results game-result--fade-in">
          {/* Scores */}
          {(() => {
            const cScore = challenge.challengerScore;
            const dScore = challenge.challengedScore;
            const bothScored = cScore !== null && dScore !== null;
            const challengerWins = bothScored && cScore > dScore;
            const challengedWins = bothScored && dScore > cScore;
            const isTied = bothScored && cScore === dScore;

            // Determine outcome text
            let outcomeText = '';
            if (bothScored) {
              const delta = Math.abs(cScore - dScore);
              if (isTied) {
                outcomeText = "It's a tie!";
              } else if (
                (isChallenger && challengerWins) ||
                (isChallenged && challengedWins)
              ) {
                outcomeText = `You won by ${delta} point${delta === 1 ? '' : 's'}!`;
              } else {
                outcomeText = `You lost by ${delta} point${delta === 1 ? '' : 's'}`;
              }
            } else if (cScore === null && dScore === null) {
              outcomeText = 'Waiting for scores...';
            } else if (cScore === null) {
              outcomeText = `Waiting for ${challenge.challengerUsername}...`;
            } else {
              outcomeText = `Waiting for ${challenge.challengedUsername}...`;
            }

            return (
              <>
                <div className="challenge-detail-scores">
                  {/* Challenger score */}
                  <div
                    className={`challenge-detail-score-card${challengerWins ? ' challenge-detail-score-card--winner' : ''}`}
                  >
                    <span className="challenge-detail-score-player">
                      {challenge.challengerUsername}
                      {isChallenger && (
                        <span className="challenge-detail-you-badge">you</span>
                      )}
                    </span>
                    {challengerWins && (
                      <span className="challenge-detail-winner-badge">Winner</span>
                    )}
                    {isTied && (
                      <span className="challenge-detail-winner-badge challenge-detail-winner-badge--tied">Tied</span>
                    )}
                    <span
                      className={`challenge-detail-score-value ${getScoreColorClass(cScore)}`}
                    >
                      {cScore !== null ? cScore : 'Waiting...'}
                    </span>
                    {cScore !== null && (
                      <span className="challenge-detail-score-label">
                        {getScoreLabel(cScore)}
                      </span>
                    )}
                  </div>

                  <div className="challenge-detail-vs">VS</div>

                  {/* Challenged score */}
                  <div
                    className={`challenge-detail-score-card${challengedWins ? ' challenge-detail-score-card--winner' : ''}`}
                  >
                    <span className="challenge-detail-score-player">
                      {challenge.challengedUsername}
                      {isChallenged && (
                        <span className="challenge-detail-you-badge">you</span>
                      )}
                    </span>
                    {challengedWins && (
                      <span className="challenge-detail-winner-badge">Winner</span>
                    )}
                    {isTied && (
                      <span className="challenge-detail-winner-badge challenge-detail-winner-badge--tied">Tied</span>
                    )}
                    <span
                      className={`challenge-detail-score-value ${getScoreColorClass(dScore)}`}
                    >
                      {dScore !== null ? dScore : 'Waiting...'}
                    </span>
                    {dScore !== null && (
                      <span className="challenge-detail-score-label">
                        {getScoreLabel(dScore)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Outcome line */}
                <div className="challenge-detail-outcome">
                  {outcomeText}
                </div>
              </>
            );
          })()}

          {/* Prompt reveal */}
          {challenge.prompt && (
            <div className="game-prompt-reveal">
              <span className="game-prompt-reveal-label">The prompt was</span>
              <p className="game-prompt-reveal-text">{challenge.prompt}</p>
            </div>
          )}

          {/* Challenged user's guess */}
          {challenge.challengedGuess && (
            <div className="game-guess-reveal">
              <span className="game-guess-reveal-label">
                {challenge.challengedUsername}'s guess
              </span>
              <p className="game-guess-reveal-text">
                &ldquo;{challenge.challengedGuess}&rdquo;
              </p>
            </div>
          )}

          {/* Challenge Back button */}
          <div className="challenge-detail-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleChallengeBack}
            >
              Challenge Back
            </button>
            <Link to="/challenges" className="btn btn-outline">
              All Challenges
            </Link>
          </div>
        </div>
      )}

      {/* ---- State: Waiting (challenger viewing pending challenge) ---- */}
      {isChallenger &&
        challenge.status === 'active' &&
        !hasGuessed && (
          <div className="challenge-detail-waiting">
            <p className="challenge-detail-waiting-text">
              Waiting for <strong>{challenge.challengedUsername}</strong> to
              guess...
            </p>
          </div>
        )}

      {/* ---- State: Declined ---- */}
      {challenge.status === 'declined' && (
        <div className="challenge-detail-declined">
          <p className="challenge-detail-declined-text">
            This challenge was declined.
          </p>
          <div className="challenge-detail-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleChallengeBack}
            >
              Challenge Again
            </button>
            <Link to="/challenges" className="btn btn-outline">
              All Challenges
            </Link>
          </div>
        </div>
      )}

      {/* ---- State: Expired ---- */}
      {challenge.status === 'expired' && (
        <div className="challenge-detail-expired">
          <p className="challenge-detail-expired-text">
            This challenge has expired.
          </p>
          <div className="challenge-detail-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleChallengeBack}
            >
              Challenge Again
            </button>
            <Link to="/challenges" className="btn btn-outline">
              All Challenges
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
