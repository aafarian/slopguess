/**
 * Friendship model types.
 * Defines the database row shape and public shapes for friend relationships.
 *
 * A friendship represents a directional relationship between two users,
 * initiated by a sender and accepted/declined by a receiver.
 */

/** Friendship lifecycle status. */
export type FriendshipStatus = 'pending' | 'accepted' | 'declined' | 'blocked';

/** Full friendship row as stored in PostgreSQL. */
export interface FriendshipRow {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: FriendshipStatus;
  created_at: Date;
  updated_at: Date;
}

/**
 * Public friendship returned by API responses.
 * Resolves the "other user" into friendId and friendUsername
 * relative to the requesting user.
 */
export interface PublicFriendship {
  id: string;
  friendId: string;
  friendUsername: string;
  status: FriendshipStatus;
  createdAt: string;
}

/**
 * Convert a FriendshipRow to a PublicFriendship.
 * Requires the friend's ID and username to be provided (from a join or separate lookup),
 * resolved relative to the current viewer.
 */
export function toPublicFriendship(
  row: FriendshipRow,
  friendId: string,
  friendUsername: string,
): PublicFriendship {
  return {
    id: row.id,
    friendId,
    friendUsername,
    status: row.status,
    createdAt: row.created_at instanceof Date
      ? row.created_at.toISOString()
      : String(row.created_at),
  };
}
