/**
 * SeasonalLeaderboardPage -- time-based aggregated leaderboard.
 *
 * Route: /leaderboards
 *
 * Features:
 * - Period type toggle: Weekly / Monthly (pill-style tabs)
 * - Period navigation: left/right arrows to browse past periods
 * - Ranked table: rank, avatar, username, games played, avg score, total score
 * - Current user's row highlighted
 * - User rank summary at top (even if not in visible top N)
 * - Responsive: table scrolls horizontally on mobile
 * - Max-width: 800px
 */

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import {
  fetchLeaderboard,
  fetchMyRank,
} from '../services/leaderboard';
import type {
  PeriodType,
  SeasonalLeaderboardEntry,
  UserSeasonalRank,
} from '../services/leaderboard';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import EmptyState from '../components/EmptyState';

// ---------------------------------------------------------------------------
// Period key helpers (client-side)
// ---------------------------------------------------------------------------

/** Get ISO week key for a date, e.g. '2026-W05'. */
function getWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  const isoYear = d.getUTCFullYear();
  return `${isoYear}-W${String(weekNo).padStart(2, '0')}`;
}

/** Get month key for a date, e.g. '2026-02'. */
function getMonthKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/** Get the default (current) period key for a period type. */
function getCurrentPeriodKey(periodType: PeriodType): string {
  const now = new Date();
  return periodType === 'weekly' ? getWeekKey(now) : getMonthKey(now);
}

/** Navigate to the previous period key. */
function getPreviousPeriodKey(periodType: PeriodType, key: string): string {
  if (periodType === 'weekly') {
    // Parse '2026-W05' -> go back one week
    const match = key.match(/^(\d{4})-W(\d{2})$/);
    if (!match) return key;
    const year = parseInt(match[1], 10);
    const week = parseInt(match[2], 10);
    // Approximate: find a date in this ISO week, subtract 7 days
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const dayOfWeek = jan4.getUTCDay() || 7;
    const firstMonday = new Date(jan4);
    firstMonday.setUTCDate(jan4.getUTCDate() - dayOfWeek + 1);
    const targetDate = new Date(firstMonday);
    targetDate.setUTCDate(firstMonday.getUTCDate() + (week - 1) * 7 - 7);
    return getWeekKey(targetDate);
  } else {
    // Parse '2026-02' -> go back one month
    const match = key.match(/^(\d{4})-(\d{2})$/);
    if (!match) return key;
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const prev = new Date(year, month - 2, 1);
    return getMonthKey(prev);
  }
}

/** Navigate to the next period key. */
function getNextPeriodKey(periodType: PeriodType, key: string): string {
  if (periodType === 'weekly') {
    const match = key.match(/^(\d{4})-W(\d{2})$/);
    if (!match) return key;
    const year = parseInt(match[1], 10);
    const week = parseInt(match[2], 10);
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const dayOfWeek = jan4.getUTCDay() || 7;
    const firstMonday = new Date(jan4);
    firstMonday.setUTCDate(jan4.getUTCDate() - dayOfWeek + 1);
    const targetDate = new Date(firstMonday);
    targetDate.setUTCDate(firstMonday.getUTCDate() + (week - 1) * 7 + 7);
    return getWeekKey(targetDate);
  } else {
    const match = key.match(/^(\d{4})-(\d{2})$/);
    if (!match) return key;
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const next = new Date(year, month, 1);
    return getMonthKey(next);
  }
}

/** Format period key for display. */
function formatPeriodLabel(periodType: PeriodType, key: string): string {
  if (periodType === 'weekly') {
    const match = key.match(/^(\d{4})-W(\d{2})$/);
    if (!match) return key;
    return `Week ${parseInt(match[2], 10)}, ${match[1]}`;
  } else {
    const match = key.match(/^(\d{4})-(\d{2})$/);
    if (!match) return key;
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    return `${monthNames[parseInt(match[2], 10) - 1]} ${match[1]}`;
  }
}

/** Check if a period key is the current period (cannot navigate forward). */
function isCurrentPeriod(periodType: PeriodType, key: string): boolean {
  return key === getCurrentPeriodKey(periodType);
}

// ---------------------------------------------------------------------------
// Avatar helpers (matching FriendsPage pattern)
// ---------------------------------------------------------------------------

const AVATAR_COLORS = [
  '#6C63FF', '#FF6584', '#43B88C', '#F9A826', '#5B8DEF',
  '#E85D75', '#36B5A0', '#D97CF6', '#EF8354', '#47C9AF',
];

function avatarColor(username: string): string {
  let hash = 5381;
  for (let i = 0; i < username.length; i++) {
    hash = (hash * 33) ^ username.charCodeAt(i);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function Avatar({ username }: { username: string }) {
  const initial = username.charAt(0).toUpperCase();
  return (
    <span
      className="sl-avatar"
      style={{ backgroundColor: avatarColor(username) }}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Medal map for top 3
// ---------------------------------------------------------------------------

const MEDALS: Record<number, string> = {
  1: '\u{1F947}',
  2: '\u{1F948}',
  3: '\u{1F949}',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SeasonalLeaderboardPage() {
  const { user, isAuthenticated } = useAuth();

  // Period type toggle
  const [periodType, setPeriodType] = useState<PeriodType>('weekly');

  // Period navigation key
  const [periodKey, setPeriodKey] = useState(() => getCurrentPeriodKey('weekly'));

  // Leaderboard data
  const [entries, setEntries] = useState<SeasonalLeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // User rank
  const [myRank, setMyRank] = useState<UserSeasonalRank | null>(null);

  // -----------------------------------------------------------------------
  // Fetch leaderboard
  // -----------------------------------------------------------------------

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [boardRes, rankRes] = await Promise.all([
        fetchLeaderboard(periodType, periodKey, 50),
        isAuthenticated
          ? fetchMyRank(periodType, periodKey).catch(() => null)
          : Promise.resolve(null),
      ]);

      setEntries(boardRes.entries);
      setMyRank(rankRes);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to load leaderboard.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [periodType, periodKey, isAuthenticated]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // -----------------------------------------------------------------------
  // Period type change
  // -----------------------------------------------------------------------

  function handlePeriodTypeChange(newType: PeriodType) {
    if (newType === periodType) return;
    setPeriodType(newType);
    setPeriodKey(getCurrentPeriodKey(newType));
  }

  // -----------------------------------------------------------------------
  // Period navigation
  // -----------------------------------------------------------------------

  function goBack() {
    setPeriodKey((prev) => getPreviousPeriodKey(periodType, prev));
  }

  function goForward() {
    if (isCurrentPeriod(periodType, periodKey)) return;
    setPeriodKey((prev) => getNextPeriodKey(periodType, prev));
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  const isCurrent = isCurrentPeriod(periodType, periodKey);

  return (
    <div className="sl-page">
      {/* Header */}
      <div className="sl-header">
        <h1 className="sl-title">Leaderboards</h1>
      </div>

      {/* Period type toggle */}
      <div className="sl-toggle">
        <button
          type="button"
          className={`sl-toggle-btn ${periodType === 'weekly' ? 'sl-toggle-btn--active' : ''}`}
          onClick={() => handlePeriodTypeChange('weekly')}
        >
          Weekly
        </button>
        <button
          type="button"
          className={`sl-toggle-btn ${periodType === 'monthly' ? 'sl-toggle-btn--active' : ''}`}
          onClick={() => handlePeriodTypeChange('monthly')}
        >
          Monthly
        </button>
      </div>

      {/* Period navigation */}
      <div className="sl-period-nav">
        <button
          type="button"
          className="sl-period-arrow"
          onClick={goBack}
          aria-label="Previous period"
        >
          {'\u2190'}
        </button>
        <span className="sl-period-label">
          {formatPeriodLabel(periodType, periodKey)}
          {isCurrent && <span className="sl-period-current-badge">Current</span>}
        </span>
        <button
          type="button"
          className="sl-period-arrow"
          onClick={goForward}
          disabled={isCurrent}
          aria-label="Next period"
        >
          {'\u2192'}
        </button>
      </div>

      {/* User rank summary */}
      {isAuthenticated && myRank && myRank.rank !== null && !isLoading && (
        <div className="sl-rank-summary">
          You're ranked <strong>#{myRank.rank}</strong> out of{' '}
          {myRank.totalEntries} player{myRank.totalEntries !== 1 ? 's' : ''}{' '}
          this {periodType === 'weekly' ? 'week' : 'month'}
        </div>
      )}

      {isAuthenticated && myRank && myRank.rank === null && !isLoading && (
        <div className="sl-rank-summary sl-rank-summary--none">
          No games played this {periodType === 'weekly' ? 'week' : 'month'} yet.
          Play a round to get ranked!
        </div>
      )}

      {/* Loading */}
      {isLoading && <LoadingSpinner message="Loading leaderboard..." />}

      {/* Error */}
      {error && <ErrorMessage message={error} onRetry={loadData} />}

      {/* Empty state */}
      {!isLoading && !error && entries.length === 0 && (
        <EmptyState
          title="No entries yet"
          message={`No one has played during this ${periodType === 'weekly' ? 'week' : 'month'} yet. Be the first!`}
        />
      )}

      {/* Leaderboard table */}
      {!isLoading && !error && entries.length > 0 && (
        <div className="sl-table-wrapper">
          <table className="sl-table">
            <thead>
              <tr>
                <th className="sl-th sl-th--rank">#</th>
                <th className="sl-th sl-th--player">Player</th>
                <th className="sl-th sl-th--games">Games</th>
                <th className="sl-th sl-th--avg">Avg</th>
                <th className="sl-th sl-th--total">Total</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const isCurrentUser = !!user && entry.userId === user.id;
                const medal = MEDALS[entry.rank];
                return (
                  <tr
                    key={entry.userId}
                    className={[
                      'sl-row',
                      isCurrentUser ? 'sl-row--current' : '',
                      entry.rank <= 3 ? `sl-row--top${entry.rank}` : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <td className="sl-td sl-td--rank">
                      {medal ? (
                        <span className="sl-medal">{medal}</span>
                      ) : (
                        entry.rank
                      )}
                    </td>
                    <td className="sl-td sl-td--player">
                      <div className="sl-player-cell">
                        <Avatar username={entry.username} />
                        <span className="sl-player-name">
                          {entry.username}
                          {isCurrentUser && (
                            <span className="leaderboard-you-badge">you</span>
                          )}
                        </span>
                      </div>
                    </td>
                    <td className="sl-td sl-td--games">{entry.gamesPlayed}</td>
                    <td className="sl-td sl-td--avg">{entry.averageScore.toFixed(1)}</td>
                    <td className="sl-td sl-td--total">{entry.totalScore}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
