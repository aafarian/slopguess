/**
 * In-memory notification service (v1).
 *
 * Stores notifications per-user in a Map keyed by userId. Notifications are
 * lost on server restart, which is acceptable for v1. A future phase can
 * persist notifications to a database table.
 *
 * Limits: Each user retains at most MAX_NOTIFICATIONS_PER_USER (50) entries.
 * When the limit is reached the oldest notification is evicted before adding
 * the new one.
 */

import { randomUUID } from "node:crypto";
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
  | "new_message";

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
// Storage
// ---------------------------------------------------------------------------

/** In-memory store: userId -> notification list. */
const store = new Map<string, Notification[]>();

// ---------------------------------------------------------------------------
// Service methods
// ---------------------------------------------------------------------------

/**
 * Add a notification for a user.
 *
 * Creates a new notification with a unique ID (crypto.randomUUID) and appends
 * it to the user's list. If the list exceeds MAX_NOTIFICATIONS_PER_USER the
 * oldest notification is evicted.
 *
 * @param userId - UUID of the recipient user
 * @param type   - Notification type
 * @param data   - Arbitrary payload (enough for the frontend to render/link)
 * @returns The newly created notification
 */
function addNotification(
  userId: string,
  type: NotificationType,
  data: Record<string, unknown>
): Notification {
  const notification: Notification = {
    id: randomUUID(),
    type,
    data,
    read: false,
    createdAt: new Date(),
  };

  let list = store.get(userId);
  if (!list) {
    list = [];
    store.set(userId, list);
  }

  list.push(notification);

  // Evict oldest when over limit
  if (list.length > MAX_NOTIFICATIONS_PER_USER) {
    list.shift();
  }

  logger.debug("notificationService", `Added ${type} notification for user ${userId}`, {
    userId,
    notificationId: notification.id,
    type,
  });

  return notification;
}

/**
 * Get all notifications for a user, sorted by createdAt DESC (newest first).
 *
 * @param userId - UUID of the user
 * @returns Array of Notification, newest first. Empty array if none exist.
 */
function getNotifications(userId: string): Notification[] {
  const list = store.get(userId);
  if (!list || list.length === 0) {
    return [];
  }

  // Return a copy sorted DESC by createdAt
  return [...list].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );
}

/**
 * Mark a notification as read.
 *
 * Validates that the notification belongs to the specified user before
 * marking it. Returns false if the notification is not found or does not
 * belong to the user.
 *
 * @param notificationId - UUID of the notification
 * @param userId         - UUID of the user claiming ownership
 * @returns true if marked successfully, false otherwise
 */
function markRead(notificationId: string, userId: string): boolean {
  const list = store.get(userId);
  if (!list) {
    return false;
  }

  const notification = list.find((n) => n.id === notificationId);
  if (!notification) {
    return false;
  }

  notification.read = true;

  logger.debug("notificationService", `Marked notification ${notificationId} as read`, {
    userId,
    notificationId,
  });

  return true;
}

/**
 * Get the count of unread notifications for a user.
 *
 * @param userId - UUID of the user
 * @returns Number of unread notifications
 */
function getUnreadCount(userId: string): number {
  const list = store.get(userId);
  if (!list) {
    return 0;
  }

  return list.filter((n) => !n.read).length;
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
