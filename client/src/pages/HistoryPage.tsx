/**
 * HistoryPage -- browse past completed rounds in a responsive grid.
 *
 * Route: /history
 *
 * Fetches completed rounds from the API with pagination (default 9 per page
 * for a clean 3x3 grid). Each card shows the round image, prompt, date,
 * total guesses, and top score. Clicking a card navigates to the round
 * detail page.
 */

import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';

import { getRoundHistory } from '../services/game';
import type { RoundHistoryItem, Pagination } from '../types/game';
import { HistoryPageSkeleton } from '../components/SkeletonLoader';
import ErrorMessage from '../components/ErrorMessage';
import EmptyState from '../components/EmptyState';

const PAGE_LIMIT = 9;

export default function HistoryPage() {
  const [rounds, setRounds] = useState<RoundHistoryItem[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRounds = useCallback(async (targetPage: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getRoundHistory(targetPage, PAGE_LIMIT);
      setRounds(data.rounds);
      setPagination(data.pagination);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to load round history.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRounds(page);
  }, [page, fetchRounds]);

  /** Format an ISO date string to a short readable date. */
  function formatDate(dateStr: string | null): string {
    if (!dateStr) return '';
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return '';
    }
  }

  // ---- Loading state ----
  if (loading) {
    return <HistoryPageSkeleton />;
  }

  // ---- Error state ----
  if (error) {
    return (
      <div className="history-page">
        <h1 className="history-page-title">Round History</h1>
        <ErrorMessage message={error} onRetry={() => fetchRounds(page)} />
      </div>
    );
  }

  // ---- Empty state ----
  if (rounds.length === 0) {
    return (
      <div className="history-page">
        <h1 className="history-page-title">Round History</h1>
        <EmptyState
          title="No completed rounds yet"
          message="Check back after the current round ends!"
        />
      </div>
    );
  }

  // ---- Render grid ----
  const isFirstPage = page <= 1;
  const isLastPage = pagination ? page >= pagination.totalPages : true;

  return (
    <div className="history-page">
      <h1 className="history-page-title">Round History</h1>

      <div className="history-grid">
        {rounds.map((round) => (
          <Link
            key={round.id}
            to={`/rounds/${round.id}`}
            className="history-card"
          >
            <div className="history-card-image-wrapper">
              {round.imageUrl ? (
                <img
                  src={round.imageUrl}
                  alt={round.prompt}
                  className="history-card-image"
                  loading="lazy"
                  onError={(e) => {
                    const target = e.currentTarget;
                    target.style.display = 'none';
                    const placeholder = document.createElement('div');
                    placeholder.className = 'history-card-image-placeholder';
                    placeholder.textContent = 'Image expired';
                    target.parentElement?.appendChild(placeholder);
                  }}
                />
              ) : (
                <div className="history-card-image-placeholder">No Image</div>
              )}
              <div className="history-card-overlay">
                <span className="history-card-date">
                  {formatDate(round.endedAt ?? round.startedAt)}
                </span>
              </div>
            </div>

            <div className="history-card-body">
              <p className="history-card-prompt">{round.prompt}</p>
              <div className="history-card-stats">
                <span className="history-card-stat">
                  <span className="history-card-stat-value">
                    {round.totalGuesses}
                  </span>{' '}
                  guesses
                </span>
                <span className="history-card-stat">
                  Top score:{' '}
                  <span className="history-card-stat-value">
                    {round.topScore ?? '--'}
                  </span>
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Pagination controls */}
      {pagination && pagination.totalPages > 1 && (
        <div className="history-pagination">
          <button
            type="button"
            className="btn btn-outline btn-sm"
            disabled={isFirstPage}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </button>
          <span className="history-pagination-indicator">
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            disabled={isLastPage}
            onClick={() =>
              setPage((p) => Math.min(pagination.totalPages, p + 1))
            }
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
