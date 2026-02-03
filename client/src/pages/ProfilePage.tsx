/**
 * ProfilePage -- player personal dashboard.
 *
 * Route: /profile (requires authentication)
 *
 * Sections:
 *  1. Stats dashboard — games played, average score, best score, worst score
 *  2. Game history — paginated list of past guesses with thumbnails and scores
 *
 * Redirects to /login if the user is not authenticated.
 */

import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useSubscription } from '../hooks/useSubscription';
import { getUserStats, getUserHistory, getStreaks, getWeeklyStats } from '../services/game';
import type { UserStats, UserHistoryEntry, Pagination, StreakData, WeeklyStats } from '../types/game';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import EmptyState from '../components/EmptyState';
import StreakDisplay from '../components/StreakDisplay';
import ProBadge from '../components/ProBadge';

const HISTORY_PAGE_LIMIT = 10;

/* -----------------------------------------------------------------------
   Score color helper — matches ScoreDisplay color coding
   ----------------------------------------------------------------------- */

function getScoreColorClass(score: number | null): string {
  if (score === null) return '';
  if (score >= 80) return 'score-excellent';
  if (score >= 50) return 'score-good';
  if (score >= 25) return 'score-decent';
  return 'score-low';
}

/* -----------------------------------------------------------------------
   Date formatting helper
   ----------------------------------------------------------------------- */

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/* -----------------------------------------------------------------------
   Component
   ----------------------------------------------------------------------- */

export default function ProfilePage() {
  const { user, isAuthenticated } = useAuth();
  const { isPro, monetizationEnabled } = useSubscription();

  // Stats state
  const [stats, setStats] = useState<UserStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState('');

  // History state
  const [history, setHistory] = useState<UserHistoryEntry[]>([]);
  const [historyPagination, setHistoryPagination] = useState<Pagination | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState('');

  // Streak state
  const [streakData, setStreakData] = useState<StreakData | null>(null);
  const [streakLoading, setStreakLoading] = useState(true);
  const [streakError, setStreakError] = useState('');

  // Weekly stats state
  const [weeklyStats, setWeeklyStats] = useState<WeeklyStats | null>(null);
  const [weeklyLoading, setWeeklyLoading] = useState(true);
  const [weeklyError, setWeeklyError] = useState('');

  // Fetch stats on mount
  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    setStatsError('');
    try {
      const res = await getUserStats();
      setStats(res.stats);
    } catch {
      setStatsError('Failed to load your stats.');
    } finally {
      setStatsLoading(false);
    }
  }, []);

  // Fetch history (re-run when page changes)
  const fetchHistory = useCallback(async (page: number) => {
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const res = await getUserHistory(page, HISTORY_PAGE_LIMIT);
      setHistory(res.history);
      setHistoryPagination(res.pagination);
    } catch {
      setHistoryError('Failed to load your game history.');
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  // Fetch streak data
  const fetchStreaks = useCallback(async () => {
    setStreakLoading(true);
    setStreakError('');
    try {
      const res = await getStreaks();
      setStreakData(res.streak);
    } catch {
      setStreakError('Failed to load streak data.');
    } finally {
      setStreakLoading(false);
    }
  }, []);

  // Fetch weekly stats
  const fetchWeeklyStats = useCallback(async () => {
    setWeeklyLoading(true);
    setWeeklyError('');
    try {
      const res = await getWeeklyStats();
      setWeeklyStats(res.weeklyStats);
    } catch {
      setWeeklyError('Failed to load weekly stats.');
    } finally {
      setWeeklyLoading(false);
    }
  }, []);

  // Kick off fetches once authenticated
  useEffect(() => {
    if (isAuthenticated) {
      fetchStats();
      fetchHistory(historyPage);
      fetchStreaks();
      fetchWeeklyStats();
    }
  }, [isAuthenticated, fetchStats, fetchHistory, historyPage, fetchStreaks, fetchWeeklyStats]);

  // Show an inline login prompt when not authenticated.
  if (!isAuthenticated) {
    return (
      <div className="profile-page">
        <div className="game-auth-cta">
          <p className="game-auth-cta-text">
            Sign in to view your profile, stats, and game history.
          </p>
          <div className="game-auth-cta-actions">
            <Link to="/login?returnTo=%2Fprofile" className="btn btn-primary">
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

  /* ----- Page handlers ------------------------------------------------- */

  function handlePrevPage() {
    setHistoryPage((p) => Math.max(1, p - 1));
  }

  function handleNextPage() {
    if (historyPagination && historyPage < historyPagination.totalPages) {
      setHistoryPage((p) => p + 1);
    }
  }

  /* ----- Render -------------------------------------------------------- */

  return (
    <div className="profile-page">
      {/* Header */}
      <div className="profile-header">
        <h1 className="profile-title">Your Profile</h1>
        {user && (
          <p className="profile-username">
            {user.username}
            {monetizationEnabled && <ProBadge isPro={isPro} />}
          </p>
        )}
        {monetizationEnabled && !isPro && (
          <Link to="/pricing" className="btn btn-sm btn-primary profile-upgrade-link">
            Upgrade to Pro
          </Link>
        )}
      </div>

      {/* ============================================================= */}
      {/* Stats Dashboard                                                */}
      {/* ============================================================= */}
      <section className="profile-stats-section">
        <h2 className="profile-section-heading">Stats</h2>

        {statsLoading && <LoadingSpinner message="Loading stats..." />}

        {statsError && (
          <ErrorMessage message={statsError} onRetry={fetchStats} />
        )}

        {!statsLoading && !statsError && stats && (
          <div className="profile-stats-grid">
            <div className="profile-stat-card profile-stat-card--games">
              <span className="profile-stat-icon">&#127918;</span>
              <span className="profile-stat-value">{stats.totalRoundsPlayed}</span>
              <span className="profile-stat-label">Games Played</span>
            </div>

            <div className="profile-stat-card profile-stat-card--avg">
              <span className="profile-stat-icon">&#9878;</span>
              <span className={`profile-stat-value ${getScoreColorClass(stats.averageScore)}`}>
                {stats.averageScore.toFixed(1)}
              </span>
              <span className="profile-stat-label">Average Score</span>
            </div>

            <div className="profile-stat-card profile-stat-card--best">
              <span className="profile-stat-icon">&#9733;</span>
              <span className={`profile-stat-value ${getScoreColorClass(stats.bestScore)}`}>
                {stats.bestScore}
              </span>
              <span className="profile-stat-label">Best Score</span>
            </div>

            <div className="profile-stat-card profile-stat-card--worst">
              <span className="profile-stat-icon">&#9888;</span>
              <span className={`profile-stat-value ${getScoreColorClass(stats.worstScore)}`}>
                {stats.worstScore}
              </span>
              <span className="profile-stat-label">Worst Score</span>
            </div>

            {/* Streak card — loaded independently */}
            {streakLoading && (
              <div className="profile-stat-card profile-stat-card--streak">
                <LoadingSpinner message="Loading streaks..." />
              </div>
            )}

            {streakError && (
              <div className="profile-stat-card profile-stat-card--streak">
                <ErrorMessage message={streakError} onRetry={fetchStreaks} />
              </div>
            )}

            {!streakLoading && !streakError && streakData && (
              <div className="profile-stat-card profile-stat-card--streak">
                <StreakDisplay
                  currentStreak={streakData.currentStreak}
                  longestStreak={streakData.longestStreak}
                  lastPlayedDate={streakData.lastPlayedDate}
                />
              </div>
            )}
          </div>
        )}
      </section>

      {/* ============================================================= */}
      {/* This Week                                                      */}
      {/* ============================================================= */}
      <section className="profile-weekly-section">
        <h2 className="profile-section-heading">This Week</h2>

        {weeklyLoading && <LoadingSpinner message="Loading weekly stats..." />}

        {weeklyError && (
          <ErrorMessage message={weeklyError} onRetry={fetchWeeklyStats} />
        )}

        {!weeklyLoading && !weeklyError && weeklyStats && (
          <div className="profile-stats-grid">
            <div className="profile-stat-card profile-stat-card--weekly-games">
              <span className="profile-stat-icon">&#128197;</span>
              <span className="profile-stat-value">{weeklyStats.gamesPlayed}</span>
              <span className="profile-stat-label">Games This Week</span>
            </div>

            <div className="profile-stat-card profile-stat-card--weekly-avg">
              <span className="profile-stat-icon">&#9878;</span>
              <span className={`profile-stat-value ${getScoreColorClass(weeklyStats.averageScore)}`}>
                {weeklyStats.averageScore.toFixed(1)}
              </span>
              <span className="profile-stat-label">Avg Score This Week</span>
            </div>

            <div className="profile-stat-card profile-stat-card--weekly-best">
              <span className="profile-stat-icon">&#9733;</span>
              <span className={`profile-stat-value ${getScoreColorClass(weeklyStats.bestScore)}`}>
                {weeklyStats.bestScore}
              </span>
              <span className="profile-stat-label">Best Score This Week</span>
            </div>
          </div>
        )}
      </section>

      {/* ============================================================= */}
      {/* Game History                                                    */}
      {/* ============================================================= */}
      <section className="profile-history-section">
        <h2 className="profile-section-heading">Game History</h2>

        {historyLoading && <LoadingSpinner message="Loading history..." />}

        {historyError && (
          <ErrorMessage
            message={historyError}
            onRetry={() => fetchHistory(historyPage)}
          />
        )}

        {!historyLoading && !historyError && history.length === 0 && (
          <EmptyState
            title="No games yet"
            message="You haven't played any rounds yet. Head to the game and start guessing!"
          />
        )}

        {!historyLoading && !historyError && history.length > 0 && (
          <>
            <ul className="profile-history-list">
              {history.map((entry) => (
                <li key={entry.roundId + entry.submittedAt} className="profile-history-item">
                  <Link
                    to={`/rounds/${entry.roundId}/leaderboard`}
                    className="profile-history-link"
                  >
                    {/* Thumbnail */}
                    <div className="profile-history-thumb-wrapper">
                      {entry.imageUrl ? (
                        <img
                          className="profile-history-thumb"
                          src={entry.imageUrl}
                          alt="Round image"
                          loading="lazy"
                        />
                      ) : (
                        <div className="profile-history-thumb profile-history-thumb--placeholder" />
                      )}
                    </div>

                    {/* Details */}
                    <div className="profile-history-details">
                      <span className="profile-history-guess">
                        &ldquo;{entry.guessText}&rdquo;
                      </span>
                      <span className="profile-history-meta">
                        {formatDate(entry.submittedAt)}
                        {entry.roundPrompt && (
                          <span className="profile-history-prompt">
                            {' '}&middot; Prompt: {entry.roundPrompt}
                          </span>
                        )}
                      </span>
                    </div>

                    {/* Score & Rank */}
                    <div className="profile-history-score-col">
                      <span className={`profile-history-score ${getScoreColorClass(entry.score)}`}>
                        {entry.score !== null ? entry.score : '--'}
                      </span>
                      <span className="profile-history-rank">
                        Rank #{entry.rank} of {entry.totalGuesses}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>

            {/* Pagination */}
            {historyPagination && historyPagination.totalPages > 1 && (
              <div className="profile-history-pagination">
                <button
                  type="button"
                  className="btn btn-sm btn-outline"
                  disabled={historyPage <= 1}
                  onClick={handlePrevPage}
                >
                  Previous
                </button>
                <span className="profile-history-page-info">
                  Page {historyPagination.page} of {historyPagination.totalPages}
                </span>
                <button
                  type="button"
                  className="btn btn-sm btn-outline"
                  disabled={historyPage >= historyPagination.totalPages}
                  onClick={handleNextPage}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
