/**
 * Activity feed service.
 *
 * Records user activity events and provides feed queries for individual
 * users and their friends. Events are inserted in a fire-and-forget pattern
 * so they never block the main request flow.
 *
 * Supported event types:
 *   - game_played          (roundId, score)
 *   - achievement_unlocked (key, title)
 *   - challenge_completed  (challengeId, won, score)
 *   - level_up             (newLevel)
 *
 * Design:
 *   - JSONB `data` column for flexible event payloads.
 *   - Friend feed uses a subquery on the friendships table (status = 'accepted').
 *   - All public functions catch errors internally so callers can
 *     fire-and-forget safely.
 */

import { pool } from "../config/database";
import { logger } from "../config/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ActivityEventType =
  | "game_played"
  | "achievement_unlocked"
  | "challenge_completed"
  | "level_up";

export interface ActivityEvent {
  id: string;
  userId: string;
  username: string;
  eventType: ActivityEventType;
  data: Record<string, unknown>;
  createdAt: string;
}

interface ActivityEventRow {
  id: string;
  user_id: string;
  username: string;
  event_type: ActivityEventType;
  data: Record<string, unknown>;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function rowToEvent(row: ActivityEventRow): ActivityEvent {
  return {
    id: row.id,
    userId: row.user_id,
    username: row.username,
    eventType: row.event_type,
    data: row.data,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Record an activity event for a user.
 *
 * This is designed to be called in a fire-and-forget pattern:
 *   activityFeedService.recordEvent(userId, 'game_played', { roundId, score }).catch(() => {});
 *
 * @param userId    - UUID of the user who performed the action
 * @param eventType - One of the supported event types
 * @param data      - Flexible JSONB payload describing the event
 */
async function recordEvent(
  userId: string,
  eventType: ActivityEventType,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO activity_events (user_id, event_type, data)
       VALUES ($1, $2, $3)`,
      [userId, eventType, JSON.stringify(data)],
    );

    logger.debug("activity", `Recorded ${eventType} event for user ${userId}`, {
      userId,
      eventType,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("activity", `Failed to record ${eventType} event for user ${userId}`, {
      userId,
      eventType,
      error: message,
    });
  }
}

/**
 * Get the activity feed for a user's friends (events from accepted friends),
 * ordered by newest first with pagination.
 *
 * Uses a subquery on the friendships table to find accepted friends, then
 * fetches their events.
 *
 * @param userId - UUID of the requesting user
 * @param limit  - Maximum number of events to return (default 20)
 * @param offset - Number of events to skip (default 0)
 */
async function getFriendFeed(
  userId: string,
  limit: number = 20,
  offset: number = 0,
): Promise<ActivityEvent[]> {
  try {
    const result = await pool.query<ActivityEventRow>(
      `SELECT ae.id, ae.user_id, u.username, ae.event_type, ae.data, ae.created_at
       FROM activity_events ae
       JOIN users u ON u.id = ae.user_id
       WHERE ae.user_id IN (
         SELECT CASE
           WHEN f.sender_id = $1 THEN f.receiver_id
           ELSE f.sender_id
         END
         FROM friendships f
         WHERE (f.sender_id = $1 OR f.receiver_id = $1)
           AND f.status = 'accepted'
       )
       ORDER BY ae.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset],
    );

    return result.rows.map(rowToEvent);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("activity", `Failed to get friend feed for user ${userId}`, {
      userId,
      error: message,
    });
    return [];
  }
}

/**
 * Get the activity feed for a single user (their own events),
 * ordered by newest first with pagination.
 *
 * @param userId - UUID of the user whose events to fetch
 * @param limit  - Maximum number of events to return (default 20)
 * @param offset - Number of events to skip (default 0)
 */
async function getUserFeed(
  userId: string,
  limit: number = 20,
  offset: number = 0,
): Promise<ActivityEvent[]> {
  try {
    const result = await pool.query<ActivityEventRow>(
      `SELECT ae.id, ae.user_id, u.username, ae.event_type, ae.data, ae.created_at
       FROM activity_events ae
       JOIN users u ON u.id = ae.user_id
       WHERE ae.user_id = $1
       ORDER BY ae.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset],
    );

    return result.rows.map(rowToEvent);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("activity", `Failed to get user feed for user ${userId}`, {
      userId,
      error: message,
    });
    return [];
  }
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const activityFeedService = {
  recordEvent,
  getFriendFeed,
  getUserFeed,
};
