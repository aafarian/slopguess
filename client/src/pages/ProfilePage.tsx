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
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getUserStats, getUserHistory } from '../services/game';
import type { UserStats, UserHistoryEntry, Pagination } from '../types/game';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import EmptyState from '../components/EmptyState';

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
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();

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

  // Auth redirect
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate('/login', { replace: true });
    }
  }, [authLoading, isAuthenticated, navigate]);

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

  // Kick off fetches once authenticated
  useEffect(() => {
    if (isAuthenticated) {
      fetchStats();
      fetchHistory(historyPage);
    }
  }, [isAuthenticated, fetchStats, fetchHistory, historyPage]);

  // While auth is resolving, show spinner
  if (authLoading) {
    return <LoadingSpinner message="Loading profile..." />;
  }

  // Safety: if not authenticated the redirect effect will fire, but render
  // nothing in the meantime.
  if (!isAuthenticated) {
    return null;
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
          <p className="profile-username">{user.username}</p>
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
