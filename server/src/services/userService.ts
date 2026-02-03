/**
 * User service — handles user creation and lookup.
 * All database interactions for the users table go through this module.
 */

import bcrypt from "bcrypt";
import { pool } from "../config/database";
import { UserRow, PublicUser, toPublicUser } from "../models/user";

/** bcrypt cost factor (2^12 iterations). */
const SALT_ROUNDS = 12;

/**
 * Create a new user.
 * Hashes the password with bcrypt before storing.
 * Returns the public user object (no password_hash).
 */
export async function createUser(
  username: string,
  email: string,
  password: string
): Promise<PublicUser> {
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const result = await pool.query<UserRow>(
    `INSERT INTO users (username, email, password_hash)
     VALUES ($1, $2, $3)
     RETURNING id, username, email, password_hash, subscription_tier, created_at, updated_at`,
    [username, email.toLowerCase(), passwordHash]
  );

  return toPublicUser(result.rows[0]);
}

/**
 * Find a user by email address.
 * Returns the full UserRow (including password_hash) for authentication checks.
 */
export async function findByEmail(email: string): Promise<UserRow | null> {
  const result = await pool.query<UserRow>(
    `SELECT id, username, email, password_hash, subscription_tier, created_at, updated_at
     FROM users
     WHERE email = $1`,
    [email.toLowerCase()]
  );

  return result.rows[0] ?? null;
}

/**
 * Find a user by username.
 * Returns the full UserRow (including password_hash) for authentication checks.
 */
export async function findByUsername(
  username: string
): Promise<UserRow | null> {
  const result = await pool.query<UserRow>(
    `SELECT id, username, email, password_hash, subscription_tier, created_at, updated_at
     FROM users
     WHERE username = $1`,
    [username]
  );

  return result.rows[0] ?? null;
}

/**
 * Find a user by ID.
 * Returns the full UserRow (including password_hash).
 */
export async function findById(id: string): Promise<UserRow | null> {
  const result = await pool.query<UserRow>(
    `SELECT id, username, email, password_hash, subscription_tier, created_at, updated_at
     FROM users
     WHERE id = $1`,
    [id]
  );

  return result.rows[0] ?? null;
}

/**
 * Verify a plaintext password against a user's stored bcrypt hash.
 * Returns true if the password matches.
 */
export async function verifyPassword(
  plaintext: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(plaintext, hash);
}

/**
 * Public profile shape returned by `getPublicProfile`.
 * Never includes email, password_hash, or subscription_tier.
 */
export interface PublicProfileUser {
  id: string;
  username: string;
  createdAt: string;
  level: number;
  xp: number;
}

/**
 * Retrieve the public profile data for a username.
 * Returns null if the user does not exist.
 * Never exposes email, password_hash, or subscription_tier.
 */
export async function getPublicProfile(
  username: string,
): Promise<PublicProfileUser | null> {
  const result = await pool.query<{
    id: string;
    username: string;
    created_at: Date;
    level: number;
    xp: number;
  }>(
    `SELECT id, username, created_at, level, xp
     FROM users
     WHERE username = $1`,
    [username],
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    id: row.id,
    username: row.username,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
    level: row.level ?? 1,
    xp: row.xp ?? 0,
  };
}
