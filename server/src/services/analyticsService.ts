/**
 * Lightweight analytics service for conversion tracking.
 *
 * Stores events in the `analytics_events` table (migration 007).
 * `trackEvent` is fire-and-forget: callers should NOT await it.
 * Errors in tracking are logged silently and never thrown to callers.
 */

import { pool } from "../config/database";
import { logger } from "../config/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Supported analytics event types. */
export type AnalyticsEventType =
  | "page_view"
  | "checkout_started"
  | "subscription_activated"
  | "subscription_canceled"
  | "challenge_limit_hit"
  | "upgrade_prompt_shown";

/** A single analytics event record. */
export interface AnalyticsEvent {
  id: string;
  userId: string | null;
  eventType: AnalyticsEventType;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

/** Aggregated conversion metrics for a date range. */
export interface ConversionMetrics {
  totalCheckoutsStarted: number;
  subscriptionsActivated: number;
  conversionRate: number;
  cancellations: number;
  startDate: Date;
  endDate: Date;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map a database row to an AnalyticsEvent object. */
function rowToEvent(row: Record<string, unknown>): AnalyticsEvent {
  return {
    id: row.id as string,
    userId: (row.user_id as string) ?? null,
    eventType: row.event_type as AnalyticsEventType,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: new Date(row.created_at as string),
  };
}

// ---------------------------------------------------------------------------
// Service methods
// ---------------------------------------------------------------------------

/**
 * Track an analytics event (fire-and-forget).
 *
 * This function catches all errors silently and logs them.
 * Callers should NOT await this -- call it without `await` so it
 * does not block the calling code path.
 */
async function trackEvent(
  userId: string | null,
  eventType: AnalyticsEventType,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO analytics_events (user_id, event_type, metadata)
       VALUES ($1, $2, $3)`,
      [userId, eventType, JSON.stringify(metadata)],
    );

    logger.debug("analyticsService", `Tracked event: ${eventType}`, {
      userId,
      eventType,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("analyticsService", "Failed to track event", {
      userId,
      eventType,
      error: message,
    });
    // Swallow the error -- fire-and-forget
  }
}

/**
 * Get aggregated conversion metrics for a date range.
 *
 * Returns:
 * - totalCheckoutsStarted: count of 'checkout_started' events
 * - subscriptionsActivated: count of 'subscription_activated' events
 * - conversionRate: activated / started (0 if no checkouts)
 * - cancellations: count of 'subscription_canceled' events
 */
async function getConversionMetrics(
  startDate: Date,
  endDate: Date,
): Promise<ConversionMetrics> {
  const result = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN event_type = 'checkout_started' THEN 1 ELSE 0 END), 0)::int
         AS checkouts_started,
       COALESCE(SUM(CASE WHEN event_type = 'subscription_activated' THEN 1 ELSE 0 END), 0)::int
         AS subscriptions_activated,
       COALESCE(SUM(CASE WHEN event_type = 'subscription_canceled' THEN 1 ELSE 0 END), 0)::int
         AS cancellations
     FROM analytics_events
     WHERE event_type IN ('checkout_started', 'subscription_activated', 'subscription_canceled')
       AND created_at >= $1
       AND created_at <= $2`,
    [startDate.toISOString(), endDate.toISOString()],
  );

  const row = result.rows[0];
  const checkoutsStarted = row.checkouts_started as number;
  const subscriptionsActivated = row.subscriptions_activated as number;
  const cancellations = row.cancellations as number;

  const conversionRate =
    checkoutsStarted > 0 ? subscriptionsActivated / checkoutsStarted : 0;

  return {
    totalCheckoutsStarted: checkoutsStarted,
    subscriptionsActivated,
    conversionRate,
    cancellations,
    startDate,
    endDate,
  };
}

/**
 * Get all analytics events for a user, ordered by created_at DESC (newest first).
 */
async function getUserJourney(userId: string): Promise<AnalyticsEvent[]> {
  const result = await pool.query(
    `SELECT id, user_id, event_type, metadata, created_at
     FROM analytics_events
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId],
  );

  return result.rows.map(rowToEvent);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const analyticsService = {
  trackEvent,
  getConversionMetrics,
  getUserJourney,
};
