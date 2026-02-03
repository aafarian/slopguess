/**
 * User model types.
 * Defines the database row shape and the safe public shape (no password_hash).
 */

/** Full user row as stored in PostgreSQL. */
export interface UserRow {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  subscription_tier: string;
  created_at: Date;
  updated_at: Date;
}

/** Public user object returned by API responses (never includes password_hash). */
export interface PublicUser {
  id: string;
  username: string;
  email: string;
  subscriptionTier: string;
  created_at: Date;
  updated_at: Date;
}

/** Strips password_hash from a UserRow to produce a safe PublicUser. */
export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    subscriptionTier: row.subscription_tier ?? "free",
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
