/**
 * RoundDetailPage -- detailed view of a specific round.
 *
 * Route: /rounds/:roundId
 *
 * Handles three round statuses:
 *
 *  1. Completed -- reveals the original prompt, shows round stats,
 *     an inline leaderboard (top 10), and the user's result if they played.
 *  2. Active    -- shows the image, guess count, and a "Play Now" CTA.
 *     If the user already guessed, shows their score and a leaderboard link.
 *     Does NOT reveal the prompt.
 *  3. Pending   -- shows a "Round not yet started" message.
 *
 * Not-found / fetch errors are handled with ErrorMessage.
 */

import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getRound, getRoundResults } from '../services/game';
import type {
  RoundDetailResponse,
  RoundResultsResponse,
  LeaderboardEntry,
  RoundStats,
  UserRoundResult,
  CompletedRound,
} from '../types/game';
import { useAuth } from '../hooks/useAuth';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import EmptyState from '../components/EmptyState';
import ScoreDisplay from '../components/ScoreDisplay';
import ElementBreakdown from '../components/ElementBreakdown';
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

/** Unicode medal characters for the top 3. */
const MEDALS: Record<number, string> = {
  1: '\u{1F947}', // gold medal
  2: '\u{1F948}', // silver medal
  3: '\u{1F949}', // bronze medal
};

/** Maximum entries shown in the inline leaderboard. */
const INLINE_LEADERBOARD_LIMIT = 10;

export default function RoundDetailPage() {
  const { roundId } = useParams<{ roundId: string }>();
  const { user } = useAuth();

  const [detail, setDetail] = useState<RoundDetailResponse | null>(null);
  const [results, setResults] = useState<RoundResultsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [printShopEnabled, setPrintShopEnabled] = useState(false);

  const fetchData = useCallback(async () => {
    if (!roundId) return;
    setIsLoading(true);
    setError(null);

    try {
      // Always fetch the round detail first to learn its status
      const detailRes = await getRound(roundId);
      setDetail(detailRes);

      // If the round is completed, also fetch full results (leaderboard + stats)
      if (detailRes.round.status === 'completed') {
        try {
          const resultsRes = await getRoundResults(roundId);
          setResults(resultsRes);
        } catch {
          // Results endpoint may fail; we still have base detail
          setResults(null);
        }
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to load round.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [roundId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Fetch print shop feature flag once on mount
  useEffect(() => {
    isPrintShopEnabled().then(setPrintShopEnabled);
  }, []);

  // ---------------------------------------------------------------------------
  // Render: Loading
  // ---------------------------------------------------------------------------
  if (isLoading) {
    return <LoadingSpinner message="Loading round details..." />;
  }

  // ---------------------------------------------------------------------------
  // Render: Error / Not Found
  // ---------------------------------------------------------------------------
  if (error) {
    return <ErrorMessage message={error} onRetry={fetchData} />;
  }

  if (!detail) {
    return (
      <ErrorMessage message="Round not found." />
    );
  }

  const { round, userGuess } = detail;
  const status = round.status;

  // ---------------------------------------------------------------------------
  // Render: Pending round
  // ---------------------------------------------------------------------------
  if (status === 'pending') {
    return (
      <div className="round-detail">
        <EmptyState
          title="Round Not Yet Started"
          message="This round hasn't started yet. Check back soon!"
        />
        <BackToHistory />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: Active round
  // ---------------------------------------------------------------------------
  if (status === 'active') {
    return (
      <div className="round-detail">
        {/* Hero image */}
        <RoundImage imageUrl={round.imageUrl} />
        {printShopEnabled && round.imageUrl && (
          <div className="round-detail-frame-cta">
            <Link
              to={`/print-shop/order?roundId=${round.id}`}
              className="frame-this-btn"
            >
              <span className="frame-this-btn-icon" aria-hidden="true">&#128444;&#65039;</span>
              Frame This
            </Link>
          </div>
        )}

        <div className="round-detail-body">
          <StatusBadge status="active" />

          {/* Round info */}
          <div className="round-detail-stats">
            <h3 className="round-detail-section-title">Round Info</h3>
            <div className="round-detail-stats-grid">
              <StatCard label="Difficulty" value={capitalize(round.difficulty ?? 'normal')} />
              <StatCard label="Prompt Words" value={round.wordCount ?? '--'} />
              <StatCard label="Guesses So Far" value={round.guessCount ?? 0} />
              <StatCard label="Started" value={timeAgo(round.startedAt)} />
            </div>
          </div>

          {userGuess ? (
            <div className="round-detail-user-result">
              <p className="round-detail-user-result-label">Your score</p>
              <div className="round-detail-user-result-score">
                <span className={scoreColorClass(userGuess.score)}>
                  {userGuess.score ?? '--'}
                </span>
              </div>
              <Link
                to={`/rounds/${round.id}/leaderboard`}
                className="btn btn-outline btn-sm"
              >
                View Leaderboard
              </Link>
            </div>
          ) : (
            <div className="round-detail-play-cta">
              <p>Think you know what prompt created this image?</p>
              <Link to="/" className="btn btn-primary">
                Play Now
              </Link>
            </div>
          )}
        </div>

        <BackToHistory />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: Completed round
  // ---------------------------------------------------------------------------
  const completedRound = round as CompletedRound;
  const stats: RoundStats | null = results?.stats ?? null;
  const leaderboard: LeaderboardEntry[] = results?.leaderboard ?? [];
  const userResult: UserRoundResult | null | undefined = results?.userResult;
  const inlineLeaderboard = leaderboard.slice(0, INLINE_LEADERBOARD_LIMIT);

  return (
    <div className="round-detail">
      {/* Hero image */}
      <RoundImage imageUrl={completedRound.imageUrl} />
      {printShopEnabled && completedRound.imageUrl && (
        <div className="round-detail-frame-cta">
          <Link
            to={`/print-shop/order?roundId=${round.id}`}
            className="frame-this-btn"
          >
            <span className="frame-this-btn-icon" aria-hidden="true">&#128444;&#65039;</span>
            Frame This
          </Link>
        </div>
      )}

      <div className="round-detail-body">
        <StatusBadge status="completed" />

        {/* Prompt reveal -- the "aha!" moment */}
        <div className="round-detail-prompt-reveal">
          <span className="round-detail-prompt-label">Original Prompt</span>
          <blockquote className="round-detail-prompt-text">
            {completedRound.prompt}
          </blockquote>
        </div>

        {/* User's result */}
        {userResult && (
          <div className="round-detail-your-result">
            <h3 className="round-detail-section-title">Your Result</h3>
            <ScoreDisplay
              score={userResult.score ?? 0}
              rank={userResult.rank}
              totalGuesses={userResult.total}
            />
            <p className="round-detail-your-guess">
              Your guess: <em>&ldquo;{userResult.guessText}&rdquo;</em>
            </p>
            {userResult.elementScores && (
              <ElementBreakdown
                elementScores={userResult.elementScores}
                promptWords={completedRound.prompt.split(/\s+/).filter(Boolean)}
              />
            )}
          </div>
        )}

        {/* Round stats */}
        {stats && (
          <div className="round-detail-stats">
            <h3 className="round-detail-section-title">Round Stats</h3>
            <div className="round-detail-stats-grid">
              <StatCard label="Total Guesses" value={stats.totalGuesses} />
              <StatCard label="Avg Score" value={stats.averageScore} />
              <StatCard label="Highest Score" value={stats.highestScore} />
              <StatCard label="Lowest Score" value={stats.lowestScore} />
            </div>
          </div>
        )}

        {/* Inline leaderboard */}
        {inlineLeaderboard.length > 0 && (
          <div className="round-detail-leaderboard">
            <h3 className="round-detail-section-title">Top Players</h3>
            <div className="round-detail-leaderboard-table-wrapper">
              <table className="round-detail-leaderboard-table">
                <thead>
                  <tr>
                    <th className="rdl-th rdl-th--rank">#</th>
                    <th className="rdl-th rdl-th--player">Player</th>
                    <th className="rdl-th rdl-th--score">Score</th>
                    <th className="rdl-th rdl-th--guess">Guess</th>
                  </tr>
                </thead>
                <tbody>
                  {inlineLeaderboard.map((entry) => {
                    const isCurrentUser = !!user && entry.userId === user.id;
                    const medal = MEDALS[entry.rank];
                    return (
                      <tr
                        key={entry.userId}
                        className={[
                          'rdl-row',
                          isCurrentUser ? 'rdl-row--current' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        <td className="rdl-td rdl-td--rank">
                          {medal ? (
                            <span className="rdl-medal">{medal}</span>
                          ) : (
                            entry.rank
                          )}
                        </td>
                        <td className="rdl-td rdl-td--player">
                          {entry.username}
                          {isCurrentUser && (
                            <span className="rdl-you-badge">you</span>
                          )}
                        </td>
                        <td className="rdl-td rdl-td--score">
                          <span className={scoreColorClass(entry.score)}>
                            {entry.score ?? '--'}
                          </span>
                        </td>
                        <td className="rdl-td rdl-td--guess">
                          {entry.guessText ?? '--'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {leaderboard.length > INLINE_LEADERBOARD_LIMIT && (
              <Link
                to={`/rounds/${round.id}/leaderboard`}
                className="btn btn-outline btn-sm round-detail-full-leaderboard-link"
              >
                View Full Leaderboard ({leaderboard.length} players)
              </Link>
            )}
          </div>
        )}
      </div>

      <BackToHistory />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function RoundImage({ imageUrl }: { imageUrl: string | null }) {
  if (!imageUrl) {
    return (
      <div className="round-detail-image-container">
        <div className="round-detail-image-placeholder">
          <span>Image unavailable</span>
        </div>
      </div>
    );
  }

  return (
    <div className="round-detail-image-container">
      <img
        src={imageUrl}
        alt="AI-generated round image"
        className="round-detail-image"
        onError={(e) => {
          e.currentTarget.style.display = 'none';
          e.currentTarget.parentElement?.querySelector('.round-detail-image-placeholder')
            ?.removeAttribute('style');
        }}
      />
      <div className="round-detail-image-placeholder" style={{ display: 'none' }}>
        <span>Image expired</span>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: 'active' | 'completed' }) {
  return (
    <span
      className={`round-detail-status-badge round-detail-status-badge--${status}`}
    >
      {status === 'completed' ? 'Completed' : 'Active'}
    </span>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="round-detail-stat-card">
      <span className="round-detail-stat-value">{value}</span>
      <span className="round-detail-stat-label">{label}</span>
    </div>
  );
}

function BackToHistory() {
  return (
    <div className="round-detail-back">
      <Link to="/history" className="btn btn-outline btn-sm">
        Back to History
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '--';
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function scoreColorClass(score: number | null): string {
  if (score === null) return '';
  if (score >= 80) return 'score-excellent';
  if (score >= 50) return 'score-good';
  if (score >= 25) return 'score-decent';
  return 'score-low';
}
