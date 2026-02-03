/**
 * ActivityFeedPage -- chronological feed of friend activity events.
 *
 * Route: /activity (requires authentication)
 *
 * Layout (top to bottom):
 *  - Page title "Friend Activity"
 *  - Event cards in reverse chronological order
 *  - "Load more" button when there are more events
 *
 * Redirects to /login if the user is not authenticated.
 */

import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getFriendFeed } from '../services/social';
import type { ActivityEvent, ActivityEventType } from '../types/social';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import EmptyState from '../components/EmptyState';

const PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format a timestamp into a relative time string. */
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

/** Return an icon string based on event type. */
function eventIcon(eventType: ActivityEventType): string {
  switch (eventType) {
    case 'game_played':
      return '\uD83C\uDFAE'; // game controller
    case 'achievement_unlocked':
      return '\uD83C\uDFC6'; // trophy
    case 'challenge_completed':
      return '\u2694\uFE0F'; // crossed swords
    case 'level_up':
      return '\u2B50'; // star
    default:
      return '\uD83D\uDD14'; // bell fallback
  }
}

/** Build a human-readable description for an event. */
function eventDescription(event: ActivityEvent): React.ReactNode {
  const { eventType, data } = event;

  switch (eventType) {
    case 'game_played': {
      const score = data.score as number | undefined;
      const roundId = data.roundId as string | undefined;
      const scoreText = score !== undefined ? ` with a score of ${score}` : '';
      if (roundId) {
        return (
          <>
            played a round{scoreText}{' '}
            <Link to={`/rounds/${roundId}`} className="activity-feed-link">
              View round
            </Link>
          </>
        );
      }
      return <>played a round{scoreText}</>;
    }

    case 'achievement_unlocked': {
      const title = (data.title as string) || 'an achievement';
      const icon = data.icon as string | undefined;
      return (
        <>
          unlocked{' '}
          <span className="activity-feed-achievement">
            {icon && <span className="activity-feed-achievement-icon">{icon}</span>}
            {title}
          </span>
        </>
      );
    }

    case 'challenge_completed': {
      const won = data.won as boolean | undefined;
      const score = data.score as number | undefined;
      const indicator = won === true ? 'Won' : won === false ? 'Lost' : 'Completed';
      const scoreText = score !== undefined ? ` (score: ${score})` : '';
      return (
        <>
          {indicator.toLowerCase()} a challenge{scoreText}{' '}
          <span className={`activity-feed-challenge-result activity-feed-challenge-result--${won ? 'win' : 'lose'}`}>
            {indicator}
          </span>
        </>
      );
    }

    case 'level_up': {
      const newLevel = data.newLevel as number | undefined;
      return (
        <>
          reached{' '}
          <span className="activity-feed-level">
            Level {newLevel ?? '?'}
          </span>
        </>
      );
    }

    default:
      return 'did something';
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ActivityFeedPage() {
  const { isAuthenticated } = useAuth();

  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  // -------------------------------------------------------------------------
  // Fetch the initial page of events
  // -------------------------------------------------------------------------

  const fetchFeed = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getFriendFeed(PAGE_SIZE, 0);
      setEvents(res.events);
      setHasMore(res.hasMore);
    } catch {
      setError('Failed to load activity feed.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetchFeed();
    }
  }, [isAuthenticated, fetchFeed]);

  // -------------------------------------------------------------------------
  // Load more (append, don't replace)
  // -------------------------------------------------------------------------

  async function handleLoadMore() {
    setLoadingMore(true);
    try {
      const res = await getFriendFeed(PAGE_SIZE, events.length);
      setEvents((prev) => [...prev, ...res.events]);
      setHasMore(res.hasMore);
    } catch {
      setError('Failed to load more events.');
    } finally {
      setLoadingMore(false);
    }
  }

  // -------------------------------------------------------------------------
  // Auth gate
  // -------------------------------------------------------------------------

  if (!isAuthenticated) {
    return (
      <div className="activity-feed-page">
        <div className="game-auth-cta">
          <p className="game-auth-cta-text">
            Sign in to see your friends' activity.
          </p>
          <div className="game-auth-cta-actions">
            <Link to="/login?returnTo=%2Factivity" className="btn btn-primary">
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

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="activity-feed-page">
      {/* Header */}
      <div className="activity-feed-header">
        <h1 className="activity-feed-title">Friend Activity</h1>
      </div>

      {/* Loading state */}
      {loading && <LoadingSpinner message="Loading activity..." />}

      {/* Error state */}
      {!loading && error && (
        <ErrorMessage message={error} onRetry={fetchFeed} />
      )}

      {/* Empty state */}
      {!loading && !error && events.length === 0 && (
        <EmptyState
          title="No activity yet"
          message="Add friends to see their activity here!"
        />
      )}

      {/* Event list */}
      {!loading && !error && events.length > 0 && (
        <>
          <ul className="activity-feed-list">
            {events.map((event) => (
              <li key={event.id} className="activity-feed-card">
                <span className="activity-feed-card-icon" aria-hidden="true">
                  {eventIcon(event.eventType)}
                </span>
                <div className="activity-feed-card-body">
                  <p className="activity-feed-card-text">
                    <Link
                      to={`/u/${encodeURIComponent(event.username)}`}
                      className="activity-feed-username"
                    >
                      {event.username}
                    </Link>{' '}
                    {eventDescription(event)}
                  </p>
                  <span className="activity-feed-card-time">
                    {timeAgo(event.createdAt)}
                  </span>
                </div>
              </li>
            ))}
          </ul>

          {/* Load more */}
          {hasMore && (
            <div className="activity-feed-load-more">
              <button
                type="button"
                className="btn btn-outline"
                disabled={loadingMore}
                onClick={handleLoadMore}
              >
                {loadingMore ? 'Loading...' : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
