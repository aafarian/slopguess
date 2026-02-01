/**
 * LeaderboardPage -- displays the ranked leaderboard for a specific round.
 *
 * Route: /rounds/:roundId/leaderboard
 *
 * Features:
 * - Round info header with image thumbnail and status badge
 * - Prompt revealed for completed rounds
 * - Ranked table: rank, player, score, and guess (completed rounds only)
 * - Current user's row highlighted
 * - Medal icons for top 3 (gold / silver / bronze)
 * - Round stats summary
 * - Loading / error / empty states via shared components
 * - Link back to the game page
 */

import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getRoundLeaderboard } from '../services/game';
import type { LeaderboardResponse, LeaderboardEntry } from '../types/game';
import { useAuth } from '../hooks/useAuth';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import EmptyState from '../components/EmptyState';

/** Unicode medal characters for the top 3. */
const MEDALS: Record<number, string> = {
  1: '\u{1F947}', // gold medal
  2: '\u{1F948}', // silver medal
  3: '\u{1F949}', // bronze medal
};

export default function LeaderboardPage() {
  const { roundId } = useParams<{ roundId: string }>();
  const { user } = useAuth();

  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLeaderboard = useCallback(async () => {
    if (!roundId) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await getRoundLeaderboard(roundId);
      setData(res);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to load leaderboard.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [roundId]);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  // Derive round state
  const isCompleted = data?.status === 'completed';
  const leaderboard = data?.leaderboard ?? [];

  // Compute basic stats from leaderboard entries
  const stats = leaderboard.length > 0
    ? {
        totalGuesses: leaderboard.length,
        topScore: Math.max(
          ...leaderboard.map((e) => e.score ?? 0),
        ),
        averageScore: Math.round(
          leaderboard.reduce((sum, e) => sum + (e.score ?? 0), 0) /
            leaderboard.length,
        ),
      }
    : null;

  // --- Render states ---

  if (isLoading) {
    return <LoadingSpinner message="Loading leaderboard..." />;
  }

  if (error) {
    return <ErrorMessage message={error} onRetry={fetchLeaderboard} />;
  }

  if (!data) {
    return <EmptyState title="Not found" message="Leaderboard data is unavailable." />;
  }

  if (leaderboard.length === 0) {
    return (
      <div className="leaderboard-page">
        <LeaderboardHeader roundId={data.roundId} isCompleted={isCompleted} />
        <EmptyState title="No guesses yet" message="Be the first to play this round!" />
        <BackLink />
      </div>
    );
  }

  return (
    <div className="leaderboard-page">
      <LeaderboardHeader roundId={data.roundId} isCompleted={isCompleted} />

      {/* Leaderboard table */}
      <div className="leaderboard-table-wrapper">
        <table className="leaderboard-table">
          <thead>
            <tr>
              <th className="leaderboard-th leaderboard-th--rank">#</th>
              <th className="leaderboard-th leaderboard-th--player">Player</th>
              <th className="leaderboard-th leaderboard-th--score">Score</th>
              {isCompleted && (
                <th className="leaderboard-th leaderboard-th--guess">Guess</th>
              )}
            </tr>
          </thead>
          <tbody>
            {leaderboard.map((entry: LeaderboardEntry) => {
              const isCurrentUser = !!user && entry.userId === user.id;
              const medal = MEDALS[entry.rank];
              return (
                <tr
                  key={entry.userId}
                  className={[
                    'leaderboard-row',
                    isCurrentUser ? 'leaderboard-row--current' : '',
                    entry.rank <= 3 ? `leaderboard-row--top${entry.rank}` : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <td className="leaderboard-td leaderboard-td--rank">
                    {medal ? (
                      <span className="leaderboard-medal">{medal}</span>
                    ) : (
                      entry.rank
                    )}
                  </td>
                  <td className="leaderboard-td leaderboard-td--player">
                    {entry.username}
                    {isCurrentUser && (
                      <span className="leaderboard-you-badge">you</span>
                    )}
                  </td>
                  <td className="leaderboard-td leaderboard-td--score">
                    <span className={scoreColorClass(entry.score)}>
                      {entry.score ?? '--'}
                    </span>
                  </td>
                  {isCompleted && (
                    <td className="leaderboard-td leaderboard-td--guess">
                      {entry.guessText ?? '--'}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Stats */}
      {stats && (
        <div className="leaderboard-stats">
          <div className="leaderboard-stat">
            <span className="leaderboard-stat-value">{stats.totalGuesses}</span>
            <span className="leaderboard-stat-label">Total Guesses</span>
          </div>
          <div className="leaderboard-stat">
            <span className="leaderboard-stat-value">{stats.averageScore}</span>
            <span className="leaderboard-stat-label">Avg Score</span>
          </div>
          <div className="leaderboard-stat">
            <span className="leaderboard-stat-value">{stats.topScore}</span>
            <span className="leaderboard-stat-label">Top Score</span>
          </div>
        </div>
      )}

      <BackLink />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function LeaderboardHeader({
  roundId,
  isCompleted,
}: {
  roundId: string;
  isCompleted: boolean;
}) {
  return (
    <div className="leaderboard-header">
      <h1 className="leaderboard-title">Leaderboard</h1>
      <div className="leaderboard-header-meta">
        <span className="leaderboard-round-id">Round {roundId.slice(0, 8)}</span>
        <span
          className={`leaderboard-status-badge ${
            isCompleted
              ? 'leaderboard-status-badge--completed'
              : 'leaderboard-status-badge--active'
          }`}
        >
          {isCompleted ? 'Completed' : 'Active'}
        </span>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <div className="leaderboard-back">
      <Link to="/play" className="btn btn-outline btn-sm">
        Back to Game
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scoreColorClass(score: number | null): string {
  if (score === null) return '';
  if (score >= 80) return 'score-excellent';
  if (score >= 50) return 'score-good';
  if (score >= 25) return 'score-decent';
  return 'score-low';
}
