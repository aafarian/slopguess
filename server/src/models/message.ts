/**
 * Message model types.
 * Defines the database row shape and public shapes for direct messages.
 *
 * Messages are exchanged between friends. Each message tracks read status
 * so unread counts can be computed per conversation.
 */

/** Full message row as stored in PostgreSQL. */
export interface MessageRow {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  read: boolean;
  created_at: Date;
}

/**
 * Public message returned by API responses.
 * Includes the sender's username (from a join or separate lookup).
 */
export interface PublicMessage {
  id: string;
  senderId: string;
  senderUsername: string;
  receiverId: string;
  content: string;
  read: boolean;
  createdAt: string;
}

/**
 * Convert a MessageRow to a PublicMessage.
 * Requires the sender's username to be provided (from a join or separate lookup).
 */
export function toPublicMessage(
  row: MessageRow,
  senderUsername: string,
): PublicMessage {
  return {
    id: row.id,
    senderId: row.sender_id,
    senderUsername,
    receiverId: row.receiver_id,
    content: row.content,
    read: row.read,
    createdAt: row.created_at instanceof Date
      ? row.created_at.toISOString()
      : String(row.created_at),
  };
}
