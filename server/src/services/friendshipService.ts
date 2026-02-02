/**
 * Friendship service — handles friend requests, acceptance, blocking, and lookup.
 * All database interactions for the friendships table go through this module.
 */

import { pool } from "../config/database";
import { FriendshipRow, PublicFriendship, toPublicFriendship } from "../models/friendship";
import { notificationService } from "./notificationService";

/**
 * Send a friend request from sender to receiver.
 * Creates a pending friendship row.
 * Throws if the user tries to friend themselves or a friendship already exists.
 */
export async function sendRequest(
  senderId: string,
  receiverId: string,
): Promise<PublicFriendship> {
  if (senderId === receiverId) {
    throw new Error("Cannot send a friend request to yourself");
  }

  // Check for an existing friendship in either direction
  const existing = await pool.query<FriendshipRow>(
    `SELECT id, sender_id, receiver_id, status, created_at, updated_at
     FROM friendships
     WHERE (sender_id = $1 AND receiver_id = $2)
        OR (sender_id = $2 AND receiver_id = $1)`,
    [senderId, receiverId],
  );

  if (existing.rows.length > 0) {
    const row = existing.rows[0];
    if (row.status === "blocked") {
      throw new Error("Cannot send a friend request to this user");
    }
    throw new Error("A friendship already exists between these users");
  }

  // Look up receiver username for the response
  const receiverResult = await pool.query<{ username: string }>(
    `SELECT username FROM users WHERE id = $1`,
    [receiverId],
  );

  if (receiverResult.rows.length === 0) {
    throw new Error("Receiver not found");
  }

  const result = await pool.query<FriendshipRow>(
    `INSERT INTO friendships (sender_id, receiver_id, status)
     VALUES ($1, $2, 'pending')
     RETURNING id, sender_id, receiver_id, status, created_at, updated_at`,
    [senderId, receiverId],
  );

  // Look up sender username for the notification
  const senderResult = await pool.query<{ username: string }>(
    `SELECT username FROM users WHERE id = $1`,
    [senderId],
  );

  // Notify the receiver about the friend request
  notificationService.addNotification(receiverId, "friend_request", {
    fromUsername: senderResult.rows[0].username,
    friendshipId: result.rows[0].id,
  });

  return toPublicFriendship(
    result.rows[0],
    receiverId,
    receiverResult.rows[0].username,
  );
}

/**
 * Accept a pending friend request.
 * Only the receiver of the request can accept it.
 */
export async function acceptRequest(
  friendshipId: string,
  userId: string,
): Promise<PublicFriendship> {
  const existing = await pool.query<FriendshipRow>(
    `SELECT id, sender_id, receiver_id, status, created_at, updated_at
     FROM friendships
     WHERE id = $1`,
    [friendshipId],
  );

  if (existing.rows.length === 0) {
    throw new Error("Friendship not found");
  }

  const row = existing.rows[0];

  if (row.receiver_id !== userId) {
    throw new Error("Only the receiver can accept a friend request");
  }

  if (row.status !== "pending") {
    throw new Error("This request is not pending");
  }

  const updated = await pool.query<FriendshipRow>(
    `UPDATE friendships
     SET status = 'accepted', updated_at = NOW()
     WHERE id = $1
     RETURNING id, sender_id, receiver_id, status, created_at, updated_at`,
    [friendshipId],
  );

  // Look up the sender's username (the friend, from receiver's perspective)
  const senderResult = await pool.query<{ username: string }>(
    `SELECT username FROM users WHERE id = $1`,
    [row.sender_id],
  );

  // Look up the receiver (accepter) username for the notification
  const accepterResult = await pool.query<{ username: string }>(
    `SELECT username FROM users WHERE id = $1`,
    [userId],
  );

  // Notify the original sender that their request was accepted
  notificationService.addNotification(row.sender_id, "friend_accepted", {
    fromUsername: accepterResult.rows[0].username,
    friendshipId,
  });

  return toPublicFriendship(
    updated.rows[0],
    row.sender_id,
    senderResult.rows[0].username,
  );
}

/**
 * Decline a pending friend request.
 * Only the receiver of the request can decline it.
 */
export async function declineRequest(
  friendshipId: string,
  userId: string,
): Promise<PublicFriendship> {
  const existing = await pool.query<FriendshipRow>(
    `SELECT id, sender_id, receiver_id, status, created_at, updated_at
     FROM friendships
     WHERE id = $1`,
    [friendshipId],
  );

  if (existing.rows.length === 0) {
    throw new Error("Friendship not found");
  }

  const row = existing.rows[0];

  if (row.receiver_id !== userId) {
    throw new Error("Only the receiver can decline a friend request");
  }

  if (row.status !== "pending") {
    throw new Error("This request is not pending");
  }

  const updated = await pool.query<FriendshipRow>(
    `UPDATE friendships
     SET status = 'declined', updated_at = NOW()
     WHERE id = $1
     RETURNING id, sender_id, receiver_id, status, created_at, updated_at`,
    [friendshipId],
  );

  const senderResult = await pool.query<{ username: string }>(
    `SELECT username FROM users WHERE id = $1`,
    [row.sender_id],
  );

  return toPublicFriendship(
    updated.rows[0],
    row.sender_id,
    senderResult.rows[0].username,
  );
}

/**
 * Block a user.
 * Creates a new blocked friendship or updates an existing friendship to blocked.
 */
export async function blockUser(
  userId: string,
  blockedId: string,
): Promise<void> {
  if (userId === blockedId) {
    throw new Error("Cannot block yourself");
  }

  // Check for an existing friendship in either direction
  const existing = await pool.query<FriendshipRow>(
    `SELECT id, sender_id, receiver_id, status, created_at, updated_at
     FROM friendships
     WHERE (sender_id = $1 AND receiver_id = $2)
        OR (sender_id = $2 AND receiver_id = $1)`,
    [userId, blockedId],
  );

  if (existing.rows.length > 0) {
    // Update the existing row: set blocker as sender, blocked as receiver
    await pool.query(
      `UPDATE friendships
       SET sender_id = $1, receiver_id = $2, status = 'blocked', updated_at = NOW()
       WHERE id = $3`,
      [userId, blockedId, existing.rows[0].id],
    );
  } else {
    await pool.query(
      `INSERT INTO friendships (sender_id, receiver_id, status)
       VALUES ($1, $2, 'blocked')`,
      [userId, blockedId],
    );
  }
}

/**
 * Remove a friendship.
 * Either party can remove/unfriend. Deletes the row entirely.
 */
export async function removeFriend(
  friendshipId: string,
  userId: string,
): Promise<void> {
  const existing = await pool.query<FriendshipRow>(
    `SELECT id, sender_id, receiver_id, status, created_at, updated_at
     FROM friendships
     WHERE id = $1`,
    [friendshipId],
  );

  if (existing.rows.length === 0) {
    throw new Error("Friendship not found");
  }

  const row = existing.rows[0];

  if (row.sender_id !== userId && row.receiver_id !== userId) {
    throw new Error("You are not part of this friendship");
  }

  await pool.query(`DELETE FROM friendships WHERE id = $1`, [friendshipId]);
}

/**
 * Get all accepted friendships for a user.
 * Joins with the users table to resolve the friend's username.
 */
export async function getFriends(userId: string): Promise<PublicFriendship[]> {
  const result = await pool.query<FriendshipRow & { friend_id: string; friend_username: string }>(
    `SELECT
       f.id, f.sender_id, f.receiver_id, f.status, f.created_at, f.updated_at,
       u.id AS friend_id,
       u.username AS friend_username
     FROM friendships f
     JOIN users u ON u.id = CASE
       WHEN f.sender_id = $1 THEN f.receiver_id
       ELSE f.sender_id
     END
     WHERE (f.sender_id = $1 OR f.receiver_id = $1)
       AND f.status = 'accepted'
     ORDER BY f.updated_at DESC`,
    [userId],
  );

  return result.rows.map((row) =>
    toPublicFriendship(row, row.friend_id, row.friend_username),
  );
}

/**
 * Get pending friend requests received by the user.
 * Only returns requests where the user is the receiver.
 */
export async function getPendingRequests(
  userId: string,
): Promise<PublicFriendship[]> {
  const result = await pool.query<FriendshipRow & { friend_id: string; friend_username: string }>(
    `SELECT
       f.id, f.sender_id, f.receiver_id, f.status, f.created_at, f.updated_at,
       u.id AS friend_id,
       u.username AS friend_username
     FROM friendships f
     JOIN users u ON u.id = f.sender_id
     WHERE f.receiver_id = $1
       AND f.status = 'pending'
     ORDER BY f.created_at DESC`,
    [userId],
  );

  return result.rows.map((row) =>
    toPublicFriendship(row, row.friend_id, row.friend_username),
  );
}

/**
 * Search users by username prefix.
 * Excludes the current user. Includes friendship status so the UI can
 * show "Pending", "Friends", etc. instead of hiding matched users.
 */
export async function searchUsers(
  query: string,
  currentUserId: string,
): Promise<Array<{ id: string; username: string; friendshipStatus: string | null }>> {
  const result = await pool.query<{ id: string; username: string; friendship_status: string | null }>(
    `SELECT u.id, u.username, f.status AS friendship_status
     FROM users u
     LEFT JOIN friendships f
       ON ((f.sender_id = $2 AND f.receiver_id = u.id)
        OR (f.sender_id = u.id AND f.receiver_id = $2))
     WHERE u.username ILIKE $1
       AND u.id != $2
     ORDER BY u.username ASC
     LIMIT 20`,
    [query + "%", currentUserId],
  );

  return result.rows.map((row) => ({
    id: row.id,
    username: row.username,
    friendshipStatus: row.friendship_status,
  }));
}

/**
 * Get pending friend requests sent by the user (outgoing).
 */
export async function getSentRequests(
  userId: string,
): Promise<PublicFriendship[]> {
  const result = await pool.query<FriendshipRow & { friend_id: string; friend_username: string }>(
    `SELECT
       f.id, f.sender_id, f.receiver_id, f.status, f.created_at, f.updated_at,
       u.id AS friend_id,
       u.username AS friend_username
     FROM friendships f
     JOIN users u ON u.id = f.receiver_id
     WHERE f.sender_id = $1
       AND f.status = 'pending'
     ORDER BY f.created_at DESC`,
    [userId],
  );

  return result.rows.map((row) =>
    toPublicFriendship(row, row.friend_id, row.friend_username),
  );
}

/**
 * Check whether two users are friends (accepted friendship).
 * Returns true only if an accepted friendship exists between them.
 * This is the core guard used by challengeService and messageService.
 */
export async function areFriends(
  userId1: string,
  userId2: string,
): Promise<boolean> {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM friendships
     WHERE ((sender_id = $1 AND receiver_id = $2)
        OR  (sender_id = $2 AND receiver_id = $1))
       AND status = 'accepted'`,
    [userId1, userId2],
  );

  return parseInt(result.rows[0].count, 10) > 0;
}
