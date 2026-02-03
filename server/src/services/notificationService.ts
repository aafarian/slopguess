/**
 * Database-backed notification service.
 *
 * Stores notifications in the `notifications` table (migration 006).
 * Each user retains at most MAX_NOTIFICATIONS_PER_USER (50) entries;
 * older ones are pruned on insert.
 */

import { pool } from "../config/database";
import { logger } from "../config/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Supported notification types. */
export type NotificationType =
  | "friend_request"
  | "friend_accepted"
  | "challenge_received"
  | "challenge_guessed"
  | "new_message"
  | "achievement_unlocked";

/** A single notification record. */
export interface Notification {
  id: string;
  type: NotificationType;
  data: Record<string, unknown>;
  read: boolean;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_NOTIFICATIONS_PER_USER = 50;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map a database row to a Notification object. */
function rowToNotification(row: Record<string, unknown>): Notification {
  return {
    id: row.id as string,
    type: row.type as NotificationType,
    data: (row.data as Record<string, unknown>) ?? {},
    read: row.read as boolean,
    createdAt: new Date(row.created_at as string),
  };
}

// ---------------------------------------------------------------------------
// Service methods
// ---------------------------------------------------------------------------

/**
 * Add a notification for a user.
 *
 * Inserts a row into the notifications table and prunes old entries
 * if the user exceeds MAX_NOTIFICATIONS_PER_USER.
 */
async function addNotification(
  userId: string,
  type: NotificationType,
  data: Record<string, unknown>,
): Promise<Notification> {
  const result = await pool.query(
    `INSERT INTO notifications (user_id, type, data)
     VALUES ($1, $2, $3)
     RETURNING id, type, data, read, created_at`,
    [userId, type, JSON.stringify(data)],
  );

  const notification = rowToNotification(result.rows[0]);

  // Prune oldest notifications beyond the limit
  await pool.query(
    `DELETE FROM notifications
     WHERE id IN (
       SELECT id FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       OFFSET $2
     )`,
    [userId, MAX_NOTIFICATIONS_PER_USER],
  );

  logger.debug("notificationService", `Added ${type} notification for user ${userId}`, {
    userId,
    notificationId: notification.id,
    type,
  });

  return notification;
}

/**
 * Get all notifications for a user, sorted by createdAt DESC (newest first).
 * Returns at most MAX_NOTIFICATIONS_PER_USER entries.
 */
async function getNotifications(userId: string): Promise<Notification[]> {
  const result = await pool.query(
    `SELECT id, type, data, read, created_at
     FROM notifications
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, MAX_NOTIFICATIONS_PER_USER],
  );

  return result.rows.map(rowToNotification);
}

/**
 * Mark a notification as read.
 *
 * Validates that the notification belongs to the specified user.
 * Returns false if not found or doesn't belong to the user.
 */
async function markRead(notificationId: string, userId: string): Promise<boolean> {
  const result = await pool.query(
    `UPDATE notifications
     SET read = TRUE
     WHERE id = $1 AND user_id = $2`,
    [notificationId, userId],
  );

  const success = (result.rowCount ?? 0) > 0;

  if (success) {
    logger.debug("notificationService", `Marked notification ${notificationId} as read`, {
      userId,
      notificationId,
    });
  }

  return success;
}

/**
 * Get the count of unread notifications for a user.
 */
async function getUnreadCount(userId: string): Promise<number> {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM notifications
     WHERE user_id = $1 AND read = FALSE`,
    [userId],
  );

  return result.rows[0].count;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const notificationService = {
  addNotification,
  getNotifications,
  markRead,
  getUnreadCount,
};
