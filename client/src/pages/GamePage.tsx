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

import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getActiveRound, rotateRound, getStreaks, getUserStats } from '../services/game';
import { fetchRecentAchievements, fetchXPStatus } from '../services/achievements';
import type { XPStatus } from '../types/achievement';
import type { Round, GuessResult, ElementScoreBreakdown, StreakData } from '../types/game';
import type { Achievement } from '../types/achievement';
import { ApiRequestError } from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import EmptyState from '../components/EmptyState';
import ScoreDisplay from '../components/ScoreDisplay';
import GuessForm from '../components/GuessForm';
import ElementBreakdown from '../components/ElementBreakdown';
import PlayerBreakdown from '../components/PlayerBreakdown';
import ShareButton from '../components/ShareButton';
import CountdownTimer from '../components/CountdownTimer';
import AdBanner from '../components/AdBanner';
import { getConfig as getPrintShopConfig } from '../services/printShop';

/** Module-level cache for the print shop enabled flag. */
let _printShopEnabled: boolean | null = null;
async function isPrintShopEnabled(): Promise<boolean> {
  if (_printShopEnabled !== null) return _printShopEnabled;
  try {
    const cfg = await getPrintShopConfig();
    _printShopEnabled = cfg.enabled;
  } catch {
    _printShopEnabled = false;
  }
  return _printShopEnabled;
}

/** Interval between polls when waiting for a new round after expiry. */
const ROTATION_POLL_MS = 5_000;

/** Duration of the "Analyzing your guess..." transition in ms. */
const ANALYZING_DELAY_MS = 1200;

type SubmissionPhase = 'idle' | 'analyzing' | 'revealed';

export default function GamePage() {
  const { isAuthenticated, user } = useAuth();
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
  const [savedGuessText, setSavedGuessText] = useState<string | null>(null);
  const [savedElementScores, setSavedElementScores] = useState<ElementScoreBreakdown | null>(null);
  const [nextRotationAt, setNextRotationAt] = useState<string | null>(null);

  // Streak data (loaded asynchronously after guess)
  const [streakData, setStreakData] = useState<StreakData | null>(null);

  // Personal best indicator (loaded asynchronously after guess)
  const [isPersonalBest, setIsPersonalBest] = useState(false);

  // Achievement unlock toast state
  const [achievementToasts, setAchievementToasts] = useState<Achievement[]>([]);

  // XP state (loaded asynchronously after guess)
  const [xpGained, setXpGained] = useState<number | null>(null);
  const [leveledUp, setLeveledUp] = useState(false);
  const [newLevel, setNewLevel] = useState<number | null>(null);
  const [preGuessXP, setPreGuessXP] = useState<XPStatus | null>(null);

  // Print shop feature flag
  const [printShopEnabled, setPrintShopEnabled] = useState(false);

  // Rotation polling state
  const [awaitingNewRound, setAwaitingNewRound] = useState(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentRoundIdRef = useRef<string | null>(null);

  // Dev toolbar state
  const [rotating, setRotating] = useState(false);
  const [devViewMode, setDevViewMode] = useState<'dev' | 'prod'>('dev');

  const fetchRound = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getActiveRound();
      setRound(data.round ?? null);
      setHasGuessed(data.hasGuessed ?? false);
      setUserScore(data.userScore ?? null);
      setSavedGuessText(data.userGuessText ?? null);
      setSavedElementScores(data.elementScores ?? null);
      setNextRotationAt(data.nextRotationAt ?? null);
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

  // Fetch streak data asynchronously (fire-and-forget, never blocks UI)
  const fetchStreakData = useCallback(async () => {
    try {
      const res = await getStreaks();
      setStreakData(res.streak);
    } catch {
      // Non-critical -- silently ignore streak fetch failures
    }
  }, []);

  // Check if the submitted score is a personal best (fire-and-forget, never blocks UI)
  const checkPersonalBest = useCallback(async (score: number) => {
    try {
      const { stats } = await getUserStats();
      // After submission the API may already include this score in bestScore.
      // If score === bestScore, this IS the personal best (or tied with it).
      if (score >= stats.bestScore) {
        setIsPersonalBest(true);
      }
    } catch {
      // Non-critical -- silently ignore stats fetch failures
    }
  }, []);

  // Capture XP snapshot before guess so we can compute gain later
  const capturePreGuessXP = useCallback(async () => {
    try {
      const status = await fetchXPStatus();
      setPreGuessXP(status);
    } catch {
      // Non-critical — silently ignore
    }
  }, []);

  useEffect(() => {
    fetchRound();
  }, [fetchRound]);

  // Fetch print shop feature flag once on mount
  useEffect(() => {
    isPrintShopEnabled().then(setPrintShopEnabled);
  }, []);

  // Keep the current round ID ref in sync so the poller can detect a change
  useEffect(() => {
    if (round) {
      currentRoundIdRef.current = round.id;
    }
  }, [round]);

  // Clean up polling interval on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  // Called by CountdownTimer when the countdown reaches zero.
  // Starts polling for the new round so the UI updates automatically.
  const handleCountdownExpired = useCallback(() => {
    // Don't start a second poller
    if (pollIntervalRef.current) return;

    const previousRoundId = currentRoundIdRef.current;
    setAwaitingNewRound(true);

    pollIntervalRef.current = setInterval(async () => {
      try {
        const data = await getActiveRound();
        const newRound = data.round ?? null;

        // Only transition when we get a genuinely new round
        if (newRound && newRound.id !== previousRoundId) {
          // Stop polling
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }

          // Reset all per-round state
          setRound(newRound);
          setHasGuessed(data.hasGuessed ?? false);
          setUserScore(data.userScore ?? null);
          setSavedGuessText(data.userGuessText ?? null);
          setSavedElementScores(data.elementScores ?? null);
          setNextRotationAt(data.nextRotationAt ?? null);
          setGuessResult(null);
          setSubmissionPhase('idle');
          setRoundEnded(false);
          setStreakData(null);
          setIsPersonalBest(false);
          setAchievementToasts([]);
          setXpGained(null);
          setLeveledUp(false);
          setNewLevel(null);
          setPreGuessXP(null);
          setAwaitingNewRound(false);
        }
      } catch {
        // 404 = server is generating the new round, keep polling
      }
    }, ROTATION_POLL_MS);
  }, []);

  // When nextRotationAt is known, schedule auto-polling for the new round
  useEffect(() => {
    if (!nextRotationAt) return;

    const delay = new Date(nextRotationAt).getTime() - Date.now();
    if (delay <= 0) {
      // Already expired — start polling immediately
      handleCountdownExpired();
      return;
    }

    const timerId = setTimeout(() => {
      handleCountdownExpired();
    }, delay);

    return () => clearTimeout(timerId);
  }, [nextRotationAt, handleCountdownExpired]);

  // Capture XP snapshot before the user guesses (so we can show gain later)
  useEffect(() => {
    if (isAuthenticated && !hasGuessed && submissionPhase === 'idle') {
      capturePreGuessXP();
    }
  }, [isAuthenticated, hasGuessed, submissionPhase, capturePreGuessXP]);

  // Fetch streak data for returning users who already guessed
  useEffect(() => {
    if (!loading && hasGuessed && isAuthenticated && !streakData && submissionPhase !== 'analyzing') {
      fetchStreakData();
    }
  }, [loading, hasGuessed, isAuthenticated, streakData, submissionPhase, fetchStreakData]);

  // Check XP gain after guess submission (compare with pre-guess snapshot)
  const checkXPGain = useCallback(async () => {
    try {
      const status = await fetchXPStatus();
      if (preGuessXP) {
        const gained = status.xp - preGuessXP.xp;
        if (gained > 0) {
          setXpGained(gained);
        }
        if (status.level > preGuessXP.level) {
          setLeveledUp(true);
          setNewLevel(status.level);
        }
      }
    } catch {
      // Non-critical — silently ignore
    }
  }, [preGuessXP]);

  // Check for newly unlocked achievements after guess (fire-and-forget)
  const checkNewAchievements = useCallback(async () => {
    try {
      const { achievements } = await fetchRecentAchievements();
      // Show achievements unlocked in the last 30 seconds (just now)
      const cutoff = Date.now() - 30_000;
      const newlyUnlocked = achievements.filter((a) => {
        if (!a.unlockedAt) return false;
        return new Date(a.unlockedAt).getTime() > cutoff;
      });
      if (newlyUnlocked.length > 0) {
        setAchievementToasts(newlyUnlocked);
      }
    } catch {
      // Non-critical -- silently ignore
    }
  }, []);

  const handleGuessSuccess = useCallback((result: GuessResult) => {
    setGuessResult(result);
    setSubmissionPhase('analyzing');

    // Kick off async streak fetch when guess is submitted
    fetchStreakData();
    // Kick off async personal best check
    if (result.score !== null) checkPersonalBest(result.score);

    setTimeout(() => {
      setSubmissionPhase('revealed');
      setHasGuessed(true);
      setUserScore(result.score);

      // Check for new achievements and XP gain after reveal (slight delay for server processing)
      setTimeout(() => {
        checkNewAchievements();
        checkXPGain();
      }, 500);
    }, ANALYZING_DELAY_MS);
  }, [fetchStreakData, checkPersonalBest, checkNewAchievements, checkXPGain]);

  const handleAlreadyGuessed = useCallback(() => {
    setHasGuessed(true);
  }, []);

  const handleRoundEnded = useCallback(() => {
    setRoundEnded(true);
    // Start polling for the next round automatically
    handleCountdownExpired();
  }, [handleCountdownExpired]);

  const handleLoginRedirect = useCallback(() => {
    const returnUrl = encodeURIComponent(window.location.pathname);
    navigate(`/login?returnTo=${returnUrl}`);
  }, [navigate]);

  const handleRotateRound = useCallback(async () => {
    setRotating(true);
    try {
      await rotateRound();
      // Reset all local state and re-fetch
      setGuessResult(null);
      setSubmissionPhase('idle');
      setHasGuessed(false);
      setUserScore(null);
      setSavedGuessText(null);
      setSavedElementScores(null);
      setNextRotationAt(null);
      setRoundEnded(false);
      setStreakData(null);
      setIsPersonalBest(false);
      setAchievementToasts([]);
      setXpGained(null);
      setLeveledUp(false);
      setNewLevel(null);
      setPreGuessXP(null);
      await fetchRound();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rotate round.');
    } finally {
      setRotating(false);
    }
  }, [fetchRound]);

  // Auto-dismiss achievement toasts after 5 seconds
  useEffect(() => {
    if (achievementToasts.length === 0) return;
    const timer = setTimeout(() => {
      setAchievementToasts([]);
    }, 5000);
    return () => clearTimeout(timer);
  }, [achievementToasts]);

  // Auto-dismiss level-up toast after 5 seconds
  useEffect(() => {
    if (!leveledUp) return;
    const timer = setTimeout(() => {
      setLeveledUp(false);
    }, 5000);
    return () => clearTimeout(timer);
  }, [leveledUp]);

  function dismissAchievementToast(id: string) {
    setAchievementToasts((prev) => prev.filter((a) => a.id !== id));
  }

  // -----------------------------------------------------------------------
  // Render: Loading
  // -----------------------------------------------------------------------
  if (loading) {
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
        {awaitingNewRound ? (
          <LoadingSpinner message="New round loading..." />
        ) : (
          <EmptyState
            title="No Active Round"
            message="Check back soon for the next round!"
          />
        )}
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
      {/* Achievement unlock toasts */}
      {achievementToasts.length > 0 && (
        <div className="achievement-toast-container">
          {achievementToasts.map((achievement) => (
            <div key={achievement.id} className="achievement-toast">
              <span className="achievement-toast-icon" aria-hidden="true">
                {achievement.icon}
              </span>
              <div className="achievement-toast-info">
                <span className="achievement-toast-label">Achievement Unlocked!</span>
                <span className="achievement-toast-title">{achievement.title}</span>
              </div>
              <button
                type="button"
                className="achievement-toast-close"
                onClick={() => dismissAchievementToast(achievement.id)}
                aria-label="Dismiss"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Level-up toast */}
      {leveledUp && newLevel !== null && (
        <div className="achievement-toast-container">
          <div className="levelup-toast">
            <span className="levelup-toast-icon" aria-hidden="true">&#11088;</span>
            <div className="levelup-toast-info">
              <span className="levelup-toast-label">Level Up!</span>
              <span className="levelup-toast-title">You reached Level {newLevel}</span>
            </div>
            <button
              type="button"
              className="achievement-toast-close"
              onClick={() => setLeveledUp(false)}
              aria-label="Dismiss"
            >
              &times;
            </button>
          </div>
        </div>
      )}

      {import.meta.env.DEV && (
        <div className="dev-toolbar">
          <span className="dev-toolbar-label">DEV</span>
          <button
            className={`btn btn-sm dev-toolbar-btn dev-toolbar-toggle dev-toolbar-toggle--${devViewMode}`}
            onClick={() => setDevViewMode(devViewMode === 'dev' ? 'prod' : 'dev')}
          >
            {devViewMode === 'dev' ? 'Dev View' : 'Prod View'}
          </button>
          <button
            className="btn btn-sm btn-outline dev-toolbar-btn"
            onClick={handleRotateRound}
            disabled={rotating}
          >
            {rotating ? 'Rotating...' : 'Next Round'}
          </button>
        </div>
      )}
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

        {/* Ad between image and controls */}
        <AdBanner slot="6540643878" />

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
          {isAuthenticated && alreadyGuessed && !isAnalyzing && (() => {
            const showDevView = import.meta.env.DEV && devViewMode === 'dev';
            const activeElementScores = guessResult?.elementScores ?? savedElementScores;
            const activePrompt = guessResult?.prompt ?? round.prompt;
            const activeGuessText = guessResult?.guessText ?? savedGuessText;

            return (
              <div className="game-result game-result--fade-in">
                {/* Personal best badge — only for fresh guesses */}
                {guessResult && isPersonalBest && (
                  <div className="game-personal-best">
                    <span className="game-personal-best-icon" aria-hidden="true">&#9733;</span>
                    <span className="game-personal-best-text">New Personal Best!</span>
                  </div>
                )}

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

                {activeGuessText && (
                  <div className="game-guess-reveal">
                    <span className="game-guess-reveal-label">Your guess</span>
                    <p className="game-guess-reveal-text">&ldquo;{activeGuessText}&rdquo;</p>
                  </div>
                )}

                {showDevView ? (
                  <>
                    {activeElementScores && (
                      <ElementBreakdown
                        elementScores={activeElementScores}
                        promptWords={activePrompt?.split(/\s+/).filter(Boolean)}
                      />
                    )}
                    {activePrompt && (
                      <div className="game-prompt-reveal">
                        <span className="game-prompt-reveal-label">The prompt was</span>
                        <p className="game-prompt-reveal-text">{activePrompt}</p>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="game-prompt-teaser">
                    {activeElementScores && (
                      <PlayerBreakdown elementScores={activeElementScores} />
                    )}
                    <p className="game-prompt-teaser-text">
                      The full prompt will be revealed when this round ends.
                    </p>
                    {nextRotationAt && (
                      <p className="game-prompt-teaser-countdown">
                        <CountdownTimer targetDate={nextRotationAt} />
                      </p>
                    )}
                  </div>
                )}

                {/* Compact streak indicator */}
                {streakData && (
                  <div className="game-streak-inline">
                    {streakData.currentStreak > 0 ? (
                      <span className="game-streak-inline-active">
                        🔥 {streakData.currentStreak} day streak!
                      </span>
                    ) : (
                      <span className="game-streak-inline-prompt">
                        Start a streak! Play again tomorrow.
                      </span>
                    )}
                  </div>
                )}

                {/* XP gained indicator */}
                {guessResult && xpGained !== null && xpGained > 0 && (
                  <div className="game-xp-gained">
                    <span className="game-xp-gained-text">+{xpGained} XP</span>
                  </div>
                )}

                {/* Share actions */}
                {user && (
                  <ShareButton
                    score={guessResult?.score ?? userScore ?? 0}
                    rank={guessResult?.rank ?? 0}
                    totalGuesses={guessResult?.totalGuesses ?? round.guessCount}
                    roundId={round.id}
                    userId={user.id}
                  />
                )}

                {/* Ad after guess submission */}
                <AdBanner slot="5642203599" />

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
                  {printShopEnabled && round.imageUrl && (
                    <Link
                      to={`/print-shop/order?roundId=${round.id}`}
                      className="frame-this-btn"
                    >
                      <span className="frame-this-btn-icon" aria-hidden="true">&#128444;&#65039;</span>
                      Frame This
                    </Link>
                  )}
                </div>
              </div>
            );
          })()}

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
