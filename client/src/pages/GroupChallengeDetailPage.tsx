/**
 * GroupChallengeDetailPage -- detail view for a single group challenge.
 *
 * Route: /group-challenges/:challengeId (requires authentication)
 *
 * View states:
 *  1. Loading       -- spinner while fetching
 *  2. Error         -- fetch error with retry button
 *  3. Not found     -- 404 or not a participant
 *  4. Pending       -- image is still being generated
 *  5. Invited       -- user has been invited (pending participant); join/decline buttons
 *  6. Joined        -- user has joined but not yet guessed; image + guess form
 *  7. Guessed       -- user has guessed; image + participant leaderboard
 *  8. Completed     -- challenge is fully resolved; results leaderboard
 *  9. Creator view  -- creator always sees prompt, participants, and scores
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import {
  getGroupChallengeDetail,
  joinGroupChallenge,
  submitGroupChallengeGuess,
  declineGroupChallenge,
} from '../services/social';
import { ApiRequestError } from '../services/api';
import type { GroupChallenge, GroupChallengeParticipant } from '../types/social';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';

const MAX_GUESS_CHARS = 200;
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

/** Display-friendly participant status label. */
function getParticipantStatusLabel(status: GroupChallengeParticipant['status']): string {
  switch (status) {
    case 'pending':
      return 'Invited';
    case 'joined':
      return 'Joined';
    case 'guessed':
      return 'Guessed';
    case 'declined':
      return 'Declined';
    default:
      return status;
  }
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
        return 'Group challenge not found.';
      default:
        return err.message || 'Something went wrong. Please try again.';
    }
  }
  return 'Something went wrong. Please try again.';
}

export default function GroupChallengeDetailPage() {
  const { challengeId } = useParams<{ challengeId: string }>();
  const { isAuthenticated, user } = useAuth();

  // Challenge data
  const [loading, setLoading] = useState(true);
  const [challenge, setChallenge] = useState<GroupChallenge | null>(null);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);

  // Guess form state
  const [guessText, setGuessText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submissionPhase, setSubmissionPhase] = useState<SubmissionPhase>('idle');
  const submittedRef = useRef(false);

  // Join/Decline state
  const [joining, setJoining] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchChallenge = useCallback(async () => {
    if (!challengeId) return;
    setLoading(true);
    setError('');
    setNotFound(false);
    try {
      const res = await getGroupChallengeDetail(challengeId);
      setChallenge(res.groupChallenge);
    } catch (err) {
      if (err instanceof ApiRequestError && (err.status === 404 || err.status === 403)) {
        setNotFound(true);
      } else {
        setError(
          err instanceof Error ? err.message : 'Failed to load group challenge.',
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
        const res = await submitGroupChallengeGuess(challengeId, trimmedGuess);
        submittedRef.current = true;
        setSubmissionPhase('analyzing');

        setTimeout(() => {
          setSubmissionPhase('revealed');
          setChallenge(res.groupChallenge);
        }, ANALYZING_DELAY_MS);
      } catch (err) {
        const message = getGuessErrorMessage(err);
        setSubmitError(message);

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

  // Join handler
  const handleJoin = useCallback(async () => {
    if (!challengeId || joining) return;
    setJoining(true);
    setActionError(null);
    try {
      const res = await joinGroupChallenge(challengeId);
      setChallenge(res.groupChallenge);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Failed to join challenge.',
      );
    } finally {
      setJoining(false);
    }
  }, [challengeId, joining]);

  // Decline handler
  const handleDecline = useCallback(async () => {
    if (!challengeId || declining) return;
    setDeclining(true);
    setActionError(null);
    try {
      const res = await declineGroupChallenge(challengeId);
      setChallenge(res.groupChallenge);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Failed to decline challenge.',
      );
    } finally {
      setDeclining(false);
    }
  }, [challengeId, declining]);

  // Unauthenticated CTA
  if (!isAuthenticated) {
    return (
      <div className="gc-detail">
        <div className="game-auth-cta">
          <p className="game-auth-cta-text">
            Sign in to view this group challenge.
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
      <div className="gc-detail">
        <LoadingSpinner message="Loading group challenge..." />
      </div>
    );
  }

  // Error
  if (error) {
    return (
      <div className="gc-detail">
        <ErrorMessage message={error} onRetry={fetchChallenge} />
      </div>
    );
  }

  // Not found
  if (notFound || !challenge) {
    return (
      <div className="gc-detail">
        <div className="gc-detail-not-found">
          <h2 className="gc-detail-not-found-title">
            Group Challenge Not Found
          </h2>
          <p className="gc-detail-not-found-text">
            This challenge may have been removed or you don't have access.
          </p>
          <Link to="/group-challenges" className="btn btn-primary">
            Back to Group Challenges
          </Link>
        </div>
      </div>
    );
  }

  // Determine user role
  const isCreator = user?.id === challenge.creatorId;
  const myParticipant = challenge.participants.find(
    (p) => p.userId === user?.id,
  );
  const myStatus = myParticipant?.status ?? null;

  // View state logic
  const isPendingImage = challenge.status === 'pending';
  const isInvited = !isCreator && myStatus === 'pending' && challenge.status === 'active';
  const canGuess =
    !isCreator &&
    myStatus === 'joined' &&
    (challenge.status === 'active' || challenge.status === 'scoring') &&
    submissionPhase === 'idle' &&
    !submittedRef.current;
  const hasGuessed = myStatus === 'guessed' || submissionPhase === 'revealed';
  const isCompleted = challenge.status === 'completed';
  const showLeaderboard = isCreator || hasGuessed || isCompleted;
  const isAnalyzing = submissionPhase === 'analyzing';

  // Sort participants by score (highest first), with null scores last
  const sortedParticipants = [...challenge.participants].sort((a, b) => {
    if (a.score !== null && b.score !== null) return b.score - a.score;
    if (a.score !== null) return -1;
    if (b.score !== null) return 1;
    return 0;
  });

  return (
    <div className="gc-detail">
      {/* Back link */}
      <div className="gc-detail-back">
        <Link to="/group-challenges" className="gc-detail-back-link">
          &larr; All Group Challenges
        </Link>
      </div>

      {/* Creator info */}
      <div className="gc-detail-creator-info">
        <span className="gc-detail-creator-label">
          {isCreator ? 'You created this challenge' : `Created by ${challenge.creatorUsername}`}
        </span>
      </div>

      {/* Image display */}
      <div className="gc-detail-image-container">
        {challenge.imageUrl ? (
          <img
            src={challenge.imageUrl}
            alt="Group challenge AI-generated image"
            className="gc-detail-image"
          />
        ) : (
          <div className="gc-detail-image-placeholder">
            <span>Image generating...</span>
          </div>
        )}
      </div>

      {/* ---- State: Pending image generation ---- */}
      {isPendingImage && (
        <div className="gc-detail-waiting">
          <p className="gc-detail-waiting-text">
            The image is being generated. Check back shortly!
          </p>
        </div>
      )}

      {/* ---- State: Invited (join/decline) ---- */}
      {isInvited && (
        <div className="gc-detail-invite-section">
          <h2 className="gc-detail-section-title">
            You've been invited to this group challenge!
          </h2>
          <p className="gc-detail-invite-text">
            Join to see the image and guess what prompt generated it.
          </p>

          {actionError && (
            <div className="game-guess-error" role="alert">
              {actionError}
            </div>
          )}

          <div className="gc-detail-invite-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleJoin}
              disabled={joining || declining}
            >
              {joining ? 'Joining...' : 'Join Challenge'}
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={handleDecline}
              disabled={joining || declining}
            >
              {declining ? 'Declining...' : 'Decline'}
            </button>
          </div>
        </div>
      )}

      {/* ---- State: Analyzing (transition) ---- */}
      {isAnalyzing && (
        <div className="game-analyzing">
          <div className="game-analyzing-spinner" />
          <p className="game-analyzing-text">Analyzing your guess...</p>
        </div>
      )}

      {/* ---- State: Guess form ---- */}
      {canGuess && (
        <div className="gc-detail-guess-section">
          <h2 className="gc-detail-section-title">
            What prompt generated this image?
          </h2>
          <form className="game-guess-form" onSubmit={handleGuessSubmit}>
            <div className="form-group">
              <div className="game-guess-input-wrapper">
                <input
                  id="gc-guess-input"
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

      {/* ---- State: Prompt reveal (after guessing or completion or creator) ---- */}
      {challenge.prompt && showLeaderboard && !isAnalyzing && (
        <div className="game-prompt-reveal">
          <span className="game-prompt-reveal-label">The prompt was</span>
          <p className="game-prompt-reveal-text">{challenge.prompt}</p>
        </div>
      )}

      {/* ---- State: Participant leaderboard ---- */}
      {showLeaderboard && !isAnalyzing && (
        <div className="gc-detail-leaderboard game-result--fade-in">
          <h2 className="gc-detail-section-title">Participants</h2>
          <div className="gc-leaderboard-table">
            <div className="gc-leaderboard-header">
              <span className="gc-leaderboard-rank">#</span>
              <span className="gc-leaderboard-player">Player</span>
              <span className="gc-leaderboard-status">Status</span>
              <span className="gc-leaderboard-score">Score</span>
            </div>
            {sortedParticipants.map((p, idx) => {
              const isMe = p.userId === user?.id;
              const rank = p.score !== null ? idx + 1 : '-';
              return (
                <div
                  key={p.id}
                  className={`gc-leaderboard-row${isMe ? ' gc-leaderboard-row--me' : ''}${p.status === 'declined' ? ' gc-leaderboard-row--declined' : ''}`}
                >
                  <span className="gc-leaderboard-rank">{rank}</span>
                  <span className="gc-leaderboard-player">
                    {p.username}
                    {isMe && (
                      <span className="gc-leaderboard-you-badge">you</span>
                    )}
                  </span>
                  <span className={`gc-leaderboard-status gc-leaderboard-status--${p.status}`}>
                    {getParticipantStatusLabel(p.status)}
                  </span>
                  <span
                    className={`gc-leaderboard-score ${getScoreColorClass(p.score)}`}
                  >
                    {p.score !== null ? (
                      <>
                        <span className="gc-leaderboard-score-value">{p.score}</span>
                        <span className="gc-leaderboard-score-label">
                          {getScoreLabel(p.score)}
                        </span>
                      </>
                    ) : p.status === 'declined' ? (
                      '--'
                    ) : (
                      'Waiting...'
                    )}
                  </span>
                </div>
              );
            })}
          </div>

          {/* My guess reveal */}
          {myParticipant?.guessText && (
            <div className="game-guess-reveal">
              <span className="game-guess-reveal-label">Your guess</span>
              <p className="game-guess-reveal-text">
                &ldquo;{myParticipant.guessText}&rdquo;
              </p>
            </div>
          )}
        </div>
      )}

      {/* ---- Creator: waiting for participants ---- */}
      {isCreator && !isCompleted && !isPendingImage && (
        <div className="gc-detail-waiting">
          <p className="gc-detail-waiting-text">
            Waiting for participants to guess...
          </p>
        </div>
      )}

      {/* ---- Declined state for participant ---- */}
      {myStatus === 'declined' && (
        <div className="gc-detail-declined">
          <p className="gc-detail-declined-text">
            You declined this group challenge.
          </p>
        </div>
      )}

      {/* Expired */}
      {challenge.status === 'expired' && (
        <div className="gc-detail-expired">
          <p className="gc-detail-expired-text">
            This group challenge has expired.
          </p>
        </div>
      )}

      {/* Back to list */}
      <div className="gc-detail-footer-actions">
        <Link to="/group-challenges" className="btn btn-outline">
          All Group Challenges
        </Link>
      </div>
    </div>
  );
}
