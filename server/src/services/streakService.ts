/**
 * Streak tracking service.
 *
 * Manages daily play-streak logic and aggregated statistics for users.
 *
 * Streak rules (all dates in UTC):
 *   - A "play" is recorded when a user submits a guess.
 *   - If the user last played **yesterday**, the current streak increments by 1.
 *   - If the user last played **today**, it is a no-op (same-day duplicate).
 *   - If there is a gap of more than 1 day (or no prior record), the streak
 *     resets to 1.
 *   - `longest_streak` is always kept >= `current_streak`.
 *
 * The `recordPlay` method is intended to be called from `scoreAndSaveGuess`
 * after a guess is persisted (wired in Task 6.7).
 */

import { pool } from "../config/database";
import { logger } from "../config/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Streak data returned by getStreak. */
export interface StreakData {
  currentStreak: number;
  longestStreak: number;
  lastPlayedDate: string | null;
}

/** Weekly aggregate stats returned by getWeeklyStats. */
export interface WeeklyStats {
  totalGuesses: number;
  averageScore: number | null;
  bestScore: number | null;
}

/** Daily aggregate stats returned by getDailyStats. */
export interface DailyStats {
  totalGuesses: number;
  averageScore: number | null;
}

// ---------------------------------------------------------------------------
// Database row types
// ---------------------------------------------------------------------------

interface UserStreakRow {
  user_id: string;
  current_streak: number;
  longest_streak: number;
  last_played_date: string | null;
  updated_at: Date;
}

interface AggregateRow {
  count: string;
  avg_score: string | null;
  max_score: string | null;
}

// ---------------------------------------------------------------------------
// Service methods
// ---------------------------------------------------------------------------

/**
 * Record that a user played today.
 *
 * Uses INSERT ... ON CONFLICT (user_id) DO UPDATE to handle both first-time
 * and returning players in a single atomic statement.
 *
 * The UPDATE branch uses a CASE expression to decide whether to increment,
 * reset, or leave the streak unchanged:
 *   - last_played_date = yesterday (UTC)  -> increment current_streak
 *   - last_played_date = today (UTC)      -> no-op (keep existing values)
 *   - anything else                       -> reset current_streak to 1
 *
 * longest_streak is updated via GREATEST to ensure it never decreases.
 *
 * @param userId - UUID of the user
 * @returns The updated streak data
 */
async function recordPlay(userId: string): Promise<StreakData> {
  const query = `
    INSERT INTO user_streaks (user_id, current_streak, longest_streak, last_played_date, updated_at)
    VALUES ($1, 1, 1, (NOW() AT TIME ZONE 'UTC')::date, NOW())
    ON CONFLICT (user_id) DO UPDATE SET
      current_streak = CASE
        -- Yesterday: extend the streak
        WHEN user_streaks.last_played_date = ((NOW() AT TIME ZONE 'UTC')::date - INTERVAL '1 day')::date
          THEN user_streaks.current_streak + 1
        -- Today: no-op, keep current value
        WHEN user_streaks.last_played_date = (NOW() AT TIME ZONE 'UTC')::date
          THEN user_streaks.current_streak
        -- Gap > 1 day or NULL: reset to 1
        ELSE 1
      END,
      longest_streak = GREATEST(
        user_streaks.longest_streak,
        CASE
          WHEN user_streaks.last_played_date = ((NOW() AT TIME ZONE 'UTC')::date - INTERVAL '1 day')::date
            THEN user_streaks.current_streak + 1
          WHEN user_streaks.last_played_date = (NOW() AT TIME ZONE 'UTC')::date
            THEN user_streaks.current_streak
          ELSE 1
        END
      ),
      last_played_date = (NOW() AT TIME ZONE 'UTC')::date,
      updated_at = NOW()
    RETURNING user_id, current_streak, longest_streak, last_played_date, updated_at
  `;

  try {
    const result = await pool.query<UserStreakRow>(query, [userId]);
    const row = result.rows[0];

    logger.debug("streakService", `Recorded play for user ${userId}`, {
      userId,
      currentStreak: row.current_streak,
      longestStreak: row.longest_streak,
    });

    return {
      currentStreak: row.current_streak,
      longestStreak: row.longest_streak,
      lastPlayedDate: row.last_played_date,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("streakService", `Failed to record play for user ${userId}`, {
      userId,
      error: message,
    });
    throw err;
  }
}

/**
 * Get the current streak data for a user.
 *
 * Returns zeros and null lastPlayedDate if no record exists (new user).
 *
 * @param userId - UUID of the user
 * @returns Streak data
 */
async function getStreak(userId: string): Promise<StreakData> {
  try {
    const result = await pool.query<UserStreakRow>(
      `SELECT user_id, current_streak, longest_streak, last_played_date, updated_at
       FROM user_streaks
       WHERE user_id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return {
        currentStreak: 0,
        longestStreak: 0,
        lastPlayedDate: null,
      };
    }

    const row = result.rows[0];
    return {
      currentStreak: row.current_streak,
      longestStreak: row.longest_streak,
      lastPlayedDate: row.last_played_date,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("streakService", `Failed to get streak for user ${userId}`, {
      userId,
      error: message,
    });
    throw err;
  }
}

/**
 * Get aggregated guess statistics for the last 7 days (UTC).
 *
 * Queries the guesses table for the given user, counting total guesses,
 * computing the average score, and finding the best (max) score.
 *
 * @param userId - UUID of the user
 * @returns Weekly stats
 */
async function getWeeklyStats(userId: string): Promise<WeeklyStats> {
  try {
    const result = await pool.query<AggregateRow>(
      `SELECT
         COUNT(*)::text           AS count,
         AVG(score)::text         AS avg_score,
         MAX(score)::text         AS max_score
       FROM guesses
       WHERE user_id = $1
         AND submitted_at >= (NOW() AT TIME ZONE 'UTC')::date - INTERVAL '6 days'`,
      [userId]
    );

    const row = result.rows[0];
    return {
      totalGuesses: parseInt(row.count, 10) || 0,
      averageScore: row.avg_score !== null ? parseFloat(row.avg_score) : null,
      bestScore: row.max_score !== null ? parseFloat(row.max_score) : null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("streakService", `Failed to get weekly stats for user ${userId}`, {
      userId,
      error: message,
    });
    throw err;
  }
}

/**
 * Get aggregated guess statistics for today (UTC).
 *
 * Queries the guesses table for the given user, counting today's guesses
 * and computing the average score.
 *
 * @param userId - UUID of the user
 * @returns Daily stats
 */
async function getDailyStats(userId: string): Promise<DailyStats> {
  try {
    const result = await pool.query<AggregateRow>(
      `SELECT
         COUNT(*)::text           AS count,
         AVG(score)::text         AS avg_score,
         NULL                     AS max_score
       FROM guesses
       WHERE user_id = $1
         AND submitted_at >= (NOW() AT TIME ZONE 'UTC')::date
         AND submitted_at < (NOW() AT TIME ZONE 'UTC')::date + INTERVAL '1 day'`,
      [userId]
    );

    const row = result.rows[0];
    return {
      totalGuesses: parseInt(row.count, 10) || 0,
      averageScore: row.avg_score !== null ? parseFloat(row.avg_score) : null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("streakService", `Failed to get daily stats for user ${userId}`, {
      userId,
      error: message,
    });
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const streakService = {
  recordPlay,
  getStreak,
  getWeeklyStats,
  getDailyStats,
};
