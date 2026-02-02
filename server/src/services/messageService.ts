/**
 * Message service — handles direct messages between friends.
 *
 * All database interactions for the messages table go through this module.
 * Messages can only be sent between users who have an accepted friendship.
 * Supports pagination, read receipts, and conversation listing.
 */

import { pool } from "../config/database";
import { MessageRow, PublicMessage, toPublicMessage } from "../models/message";
import { areFriends } from "./friendshipService";
import { notificationService } from "./notificationService";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Standard pagination envelope returned by list methods. */
export interface PaginatedResult<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** A conversation summary entry for getConversationList. */
export interface ConversationSummary {
  partnerId: string;
  partnerUsername: string;
  lastMessage: PublicMessage;
  unreadCount: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_MESSAGE_LENGTH = 500;
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

// ---------------------------------------------------------------------------
// Service methods
// ---------------------------------------------------------------------------

/**
 * Send a message from one user to another.
 *
 * Validates that the sender and receiver are friends (accepted friendship),
 * validates message content (non-empty, max 500 chars), and inserts the
 * message into the database.
 *
 * @param senderId  - UUID of the sender
 * @param receiverId - UUID of the receiver
 * @param content   - Message text
 * @returns The created PublicMessage
 */
async function sendMessage(
  senderId: string,
  receiverId: string,
  content: string,
): Promise<PublicMessage> {
  if (senderId === receiverId) {
    throw new Error("Cannot send a message to yourself");
  }

  // Validate content
  const trimmed = content.trim();
  if (trimmed.length === 0) {
    throw new Error("Message content cannot be empty");
  }
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`Message content cannot exceed ${MAX_MESSAGE_LENGTH} characters`);
  }

  // Check friendship
  const friends = await areFriends(senderId, receiverId);
  if (!friends) {
    throw new Error("You can only send messages to friends");
  }

  // Insert message
  const result = await pool.query<MessageRow>(
    `INSERT INTO messages (sender_id, receiver_id, content)
     VALUES ($1, $2, $3)
     RETURNING id, sender_id, receiver_id, content, read, created_at`,
    [senderId, receiverId, trimmed],
  );

  // Look up sender username for the response
  const senderResult = await pool.query<{ username: string }>(
    `SELECT username FROM users WHERE id = $1`,
    [senderId],
  );

  // Notify the receiver about the new message
  await notificationService.addNotification(receiverId, "new_message", {
    fromUsername: senderResult.rows[0].username,
    messageId: result.rows[0].id,
  });

  return toPublicMessage(result.rows[0], senderResult.rows[0].username);
}

/**
 * Get a paginated conversation between two users.
 *
 * Returns messages between userId1 and userId2 ordered by created_at DESC
 * (newest first). Both directions of messages are included.
 *
 * @param userId1    - UUID of the first user
 * @param userId2    - UUID of the second user
 * @param pagination - Optional page and limit
 * @returns Paginated result of PublicMessage
 */
async function getConversation(
  userId1: string,
  userId2: string,
  pagination: { page?: number; limit?: number } = {},
): Promise<PaginatedResult<PublicMessage>> {
  const page = pagination.page ?? DEFAULT_PAGE;
  const limit = pagination.limit ?? DEFAULT_LIMIT;
  const offset = (page - 1) * limit;

  // Get total count
  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM messages
     WHERE (sender_id = $1 AND receiver_id = $2)
        OR (sender_id = $2 AND receiver_id = $1)`,
    [userId1, userId2],
  );
  const total = parseInt(countResult.rows[0].count, 10);

  // Get paginated messages with sender username
  const result = await pool.query<MessageRow & { sender_username: string }>(
    `SELECT
       m.id, m.sender_id, m.receiver_id, m.content, m.read, m.created_at,
       u.username AS sender_username
     FROM messages m
     JOIN users u ON u.id = m.sender_id
     WHERE (m.sender_id = $1 AND m.receiver_id = $2)
        OR (m.sender_id = $2 AND m.receiver_id = $1)
     ORDER BY m.created_at DESC
     LIMIT $3 OFFSET $4`,
    [userId1, userId2, limit, offset],
  );

  return {
    data: result.rows.map((row) => toPublicMessage(row, row.sender_username)),
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

/**
 * Mark a message as read.
 *
 * Only the receiver of the message can mark it as read. Returns the updated
 * PublicMessage.
 *
 * @param messageId - UUID of the message
 * @param userId    - UUID of the user attempting to mark as read
 * @returns The updated PublicMessage
 */
async function markAsRead(
  messageId: string,
  userId: string,
): Promise<PublicMessage> {
  const existing = await pool.query<MessageRow>(
    `SELECT id, sender_id, receiver_id, content, read, created_at
     FROM messages
     WHERE id = $1`,
    [messageId],
  );

  if (existing.rows.length === 0) {
    throw new Error("Message not found");
  }

  const row = existing.rows[0];

  if (row.receiver_id !== userId) {
    throw new Error("Only the recipient can mark a message as read");
  }

  if (row.read) {
    // Already read — just return current state
    const senderResult = await pool.query<{ username: string }>(
      `SELECT username FROM users WHERE id = $1`,
      [row.sender_id],
    );
    return toPublicMessage(row, senderResult.rows[0].username);
  }

  const updated = await pool.query<MessageRow>(
    `UPDATE messages
     SET read = TRUE
     WHERE id = $1
     RETURNING id, sender_id, receiver_id, content, read, created_at`,
    [messageId],
  );

  const senderResult = await pool.query<{ username: string }>(
    `SELECT username FROM users WHERE id = $1`,
    [row.sender_id],
  );

  return toPublicMessage(updated.rows[0], senderResult.rows[0].username);
}

/**
 * Get the total count of unread messages for a user.
 *
 * Counts all messages where the user is the receiver and read is FALSE.
 *
 * @param userId - UUID of the user
 * @returns Number of unread messages
 */
async function getUnreadCount(userId: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM messages
     WHERE receiver_id = $1 AND read = FALSE`,
    [userId],
  );

  return parseInt(result.rows[0].count, 10);
}

/**
 * Get a list of conversation partners with the latest message, unread count,
 * and partner username.
 *
 * For each unique conversation partner, returns the most recent message and
 * the count of unread messages from that partner. Results are ordered by
 * most recent message first.
 *
 * Uses a subquery approach to find distinct conversation partners and their
 * latest message, then enriches with unread counts and partner usernames.
 *
 * @param userId - UUID of the user
 * @returns Array of ConversationSummary ordered by most recent message
 */
async function getConversationList(
  userId: string,
): Promise<ConversationSummary[]> {
  // Step 1: Find all distinct conversation partners and their latest message.
  //
  // The subquery finds the partner ID for each message involving the user,
  // then for each partner we pick the latest message (by created_at DESC).
  // We also compute unread counts from that partner in a lateral join.
  const result = await pool.query<
    MessageRow & {
      partner_id: string;
      partner_username: string;
      sender_username: string;
      unread_count: string;
    }
  >(
    `WITH conversations AS (
       SELECT
         CASE
           WHEN m.sender_id = $1 THEN m.receiver_id
           ELSE m.sender_id
         END AS partner_id,
         m.id,
         m.sender_id,
         m.receiver_id,
         m.content,
         m.read,
         m.created_at,
         ROW_NUMBER() OVER (
           PARTITION BY CASE
             WHEN m.sender_id = $1 THEN m.receiver_id
             ELSE m.sender_id
           END
           ORDER BY m.created_at DESC
         ) AS rn
       FROM messages m
       WHERE m.sender_id = $1 OR m.receiver_id = $1
     )
     SELECT
       c.partner_id,
       u.username AS partner_username,
       c.id,
       c.sender_id,
       c.receiver_id,
       c.content,
       c.read,
       c.created_at,
       su.username AS sender_username,
       COALESCE(unread.cnt, 0)::text AS unread_count
     FROM conversations c
     JOIN users u ON u.id = c.partner_id
     JOIN users su ON su.id = c.sender_id
     LEFT JOIN LATERAL (
       SELECT COUNT(*) AS cnt
       FROM messages m2
       WHERE m2.sender_id = c.partner_id
         AND m2.receiver_id = $1
         AND m2.read = FALSE
     ) unread ON TRUE
     WHERE c.rn = 1
     ORDER BY c.created_at DESC`,
    [userId],
  );

  return result.rows.map((row) => ({
    partnerId: row.partner_id,
    partnerUsername: row.partner_username,
    lastMessage: toPublicMessage(row, row.sender_username),
    unreadCount: parseInt(row.unread_count, 10),
  }));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const messageService = {
  sendMessage,
  getConversation,
  markAsRead,
  getUnreadCount,
  getConversationList,
};
