/**
 * SkeletonLoader -- renders shimmer placeholder shapes that match the
 * final layout of the content being loaded.
 *
 * Variants:
 *  - text:       A single line of text (configurable width)
 *  - image:      A rectangular image placeholder (configurable aspect ratio)
 *  - card:       A card with image area + text lines (history card shape)
 *  - table-row:  A table row with column placeholders
 *
 * Usage:
 *   <SkeletonLoader variant="image" />
 *   <SkeletonLoader variant="text" width="60%" />
 *   <SkeletonLoader variant="card" count={9} />
 *   <SkeletonLoader variant="table-row" count={5} columns={4} />
 *
 * Compound skeletons for specific pages:
 *   <GamePageSkeleton />
 *   <HistoryPageSkeleton />
 *   <LeaderboardPageSkeleton />
 */

import type { CSSProperties } from 'react';

/* -------------------------------------------------------------------------- */
/* Base skeleton block                                                         */
/* -------------------------------------------------------------------------- */

interface SkeletonBlockProps {
  width?: string;
  height?: string;
  borderRadius?: string;
  style?: CSSProperties;
  className?: string;
}

function SkeletonBlock({
  width = '100%',
  height = '1rem',
  borderRadius = '6px',
  style,
  className = '',
}: SkeletonBlockProps) {
  return (
    <div
      className={`skeleton-block ${className}`}
      style={{ width, height, borderRadius, ...style }}
      aria-hidden="true"
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Variant: text                                                               */
/* -------------------------------------------------------------------------- */

function SkeletonText({ width = '100%' }: { width?: string }) {
  return <SkeletonBlock width={width} height="0.95rem" />;
}

/* -------------------------------------------------------------------------- */
/* Variant: image                                                              */
/* -------------------------------------------------------------------------- */

function SkeletonImage({
  aspectRatio = '16 / 9',
  borderRadius = '12px',
}: {
  aspectRatio?: string;
  borderRadius?: string;
}) {
  return (
    <SkeletonBlock
      width="100%"
      height="auto"
      borderRadius={borderRadius}
      style={{ aspectRatio }}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Variant: card (matches history-card layout)                                 */
/* -------------------------------------------------------------------------- */

function SkeletonCard() {
  return (
    <div className="skeleton-card" aria-hidden="true">
      <SkeletonImage aspectRatio="16 / 9" borderRadius="0" />
      <div className="skeleton-card-body">
        <SkeletonText width="85%" />
        <SkeletonText width="55%" />
        <div className="skeleton-card-stats">
          <SkeletonBlock width="60px" height="0.75rem" />
          <SkeletonBlock width="80px" height="0.75rem" />
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Variant: table-row                                                          */
/* -------------------------------------------------------------------------- */

function SkeletonTableRow({ columns = 3 }: { columns?: number }) {
  const widths = ['40px', '45%', '60px', '35%'];
  return (
    <tr className="skeleton-table-row" aria-hidden="true">
      {Array.from({ length: columns }, (_, i) => (
        <td key={i} className="skeleton-table-cell">
          <SkeletonBlock
            width={widths[i % widths.length]}
            height="0.9rem"
          />
        </td>
      ))}
    </tr>
  );
}

/* -------------------------------------------------------------------------- */
/* Main SkeletonLoader component                                               */
/* -------------------------------------------------------------------------- */

interface SkeletonLoaderProps {
  variant: 'text' | 'image' | 'card' | 'table-row';
  count?: number;
  width?: string;
  columns?: number;
  aspectRatio?: string;
}

export default function SkeletonLoader({
  variant,
  count = 1,
  width,
  columns,
  aspectRatio,
}: SkeletonLoaderProps) {
  const items = Array.from({ length: count }, (_, i) => i);

  switch (variant) {
    case 'text':
      return (
        <div className="skeleton-text-group">
          {items.map((i) => (
            <SkeletonText key={i} width={width} />
          ))}
        </div>
      );

    case 'image':
      return <SkeletonImage aspectRatio={aspectRatio} />;

    case 'card':
      return (
        <>
          {items.map((i) => (
            <SkeletonCard key={i} />
          ))}
        </>
      );

    case 'table-row':
      return (
        <>
          {items.map((i) => (
            <SkeletonTableRow key={i} columns={columns} />
          ))}
        </>
      );

    default:
      return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Compound skeletons for specific pages                                       */
/* -------------------------------------------------------------------------- */

/**
 * GamePageSkeleton -- image placeholder + controls skeleton.
 * Matches the game-layout grid (image left, controls right on desktop).
 */
export function GamePageSkeleton() {
  return (
    <div className="game-page">
      <div className="game-layout">
        {/* Image panel skeleton */}
        <div className="game-image-panel">
          <div className="skeleton-game-image">
            <SkeletonBlock
              width="100%"
              height="auto"
              borderRadius="12px"
              style={{ aspectRatio: '4 / 3', minHeight: '280px' }}
            />
          </div>
        </div>

        {/* Controls panel skeleton */}
        <div className="game-controls-panel">
          {/* Round info skeleton */}
          <div className="skeleton-controls-info">
            <SkeletonBlock width="160px" height="0.85rem" />
          </div>

          {/* Guess form skeleton */}
          <div className="skeleton-guess-form">
            <SkeletonBlock width="140px" height="1rem" style={{ marginBottom: '0.5rem' }} />
            <SkeletonBlock width="100%" height="48px" borderRadius="8px" />
            <SkeletonBlock
              width="100%"
              height="44px"
              borderRadius="6px"
              style={{ marginTop: '0.75rem' }}
              className="skeleton-block--accent"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * HistoryPageSkeleton -- card grid skeleton matching 3x3 default.
 */
export function HistoryPageSkeleton() {
  return (
    <div className="history-page">
      <h1 className="history-page-title">Round History</h1>
      <div className="history-grid">
        <SkeletonLoader variant="card" count={9} />
      </div>
    </div>
  );
}

/**
 * LeaderboardPageSkeleton -- header + table rows skeleton.
 */
export function LeaderboardPageSkeleton() {
  return (
    <div className="leaderboard-page">
      {/* Header skeleton */}
      <div className="leaderboard-header">
        <div className="skeleton-leaderboard-title">
          <SkeletonBlock width="180px" height="2rem" borderRadius="8px" />
        </div>
        <div className="skeleton-leaderboard-meta" style={{ marginTop: '0.5rem', display: 'flex', justifyContent: 'center', gap: '0.75rem' }}>
          <SkeletonBlock width="100px" height="0.85rem" />
          <SkeletonBlock width="72px" height="1.25rem" borderRadius="4px" />
        </div>
      </div>

      {/* Table skeleton */}
      <div className="leaderboard-table-wrapper">
        <table className="leaderboard-table">
          <thead>
            <tr>
              <th className="leaderboard-th leaderboard-th--rank">#</th>
              <th className="leaderboard-th leaderboard-th--player">Player</th>
              <th className="leaderboard-th leaderboard-th--score">Score</th>
              <th className="leaderboard-th leaderboard-th--guess">Guess</th>
            </tr>
          </thead>
          <tbody>
            <SkeletonLoader variant="table-row" count={8} columns={4} />
          </tbody>
        </table>
      </div>

      {/* Stats skeleton */}
      <div className="leaderboard-stats">
        {[1, 2, 3].map((i) => (
          <div key={i} className="leaderboard-stat">
            <SkeletonBlock width="48px" height="1.5rem" />
            <SkeletonBlock width="72px" height="0.7rem" style={{ marginTop: '0.25rem' }} />
          </div>
        ))}
      </div>
    </div>
  );
}
