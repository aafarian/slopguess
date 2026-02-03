/**
 * XP and leveling service.
 *
 * Handles experience point accumulation and automatic level-ups.
 * Called in a fire-and-forget pattern from request handlers after
 * key user actions (guessing, challenge wins, achievements).
 *
 * Design:
 *   - XP only accumulates; it is never reduced.
 *   - Leveling curve: xpForLevel(n) = 100 * n (cumulative XP needed).
 *     Level 2 at 200 total XP, level 3 at 300, etc.
 *   - `awardXP` atomically increments XP and recalculates level.
 *   - All public functions catch errors internally so callers can
 *     fire-and-forget safely.
 */

import { pool } from "../config/database";
import { logger } from "../config/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface XPAwardResult {
  newXP: number;
  newLevel: number;
  leveledUp: boolean;
}

export interface XPStatus {
  xp: number;
  level: number;
  xpForNextLevel: number;
  xpProgress: number;
}

// ---------------------------------------------------------------------------
// Leveling math
// ---------------------------------------------------------------------------

/**
 * Cumulative XP required to reach a given level.
 *
 * Level 1 = 0 XP (starting level)
 * Level 2 = 200 XP
 * Level 3 = 300 XP
 * Level n = 100 * n  (for n >= 2)
 */
function cumulativeXPForLevel(level: number): number {
  if (level <= 1) return 0;
  return 100 * level;
}

/**
 * Determine the level for a given cumulative XP total.
 * Inverse of cumulativeXPForLevel: find the highest level n
 * such that cumulativeXPForLevel(n) <= xp.
 */
function levelForXP(xp: number): number {
  if (xp < 200) return 1; // Need 200 XP for level 2
  return Math.floor(xp / 100);
}

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Award XP to a user atomically. Increments the user's XP total and
 * recalculates their level.
 *
 * @param userId - UUID of the user
 * @param amount - XP to add (must be positive)
 * @param source - Description of the source (for logging)
 * @returns The user's new XP total, new level, and whether they leveled up
 */
async function awardXP(
  userId: string,
  amount: number,
  source: string,
): Promise<XPAwardResult> {
  if (amount <= 0) {
    return { newXP: 0, newLevel: 1, leveledUp: false };
  }

  // Atomically increment XP and fetch the new total + old level
  const result = await pool.query<{ xp: number; level: number }>(
    `UPDATE users
     SET xp = xp + $2
     WHERE id = $1
     RETURNING xp, level`,
    [userId, amount],
  );

  if (result.rows.length === 0) {
    logger.warn("xp", `User ${userId} not found when awarding XP`, {
      userId,
      amount,
      source,
    });
    return { newXP: 0, newLevel: 1, leveledUp: false };
  }

  const { xp: newXP, level: oldLevel } = result.rows[0];
  const newLevel = levelForXP(newXP);
  const leveledUp = newLevel > oldLevel;

  // Update the cached level column if it changed
  if (leveledUp) {
    await pool.query(
      `UPDATE users SET level = $2 WHERE id = $1`,
      [userId, newLevel],
    );

    logger.info("xp", `User ${userId} leveled up to ${newLevel}!`, {
      userId,
      newXP,
      oldLevel,
      newLevel,
      source,
    });
  }

  logger.debug("xp", `Awarded ${amount} XP to user ${userId} (${source})`, {
    userId,
    amount,
    source,
    newXP,
    newLevel,
  });

  return { newXP, newLevel, leveledUp };
}

/**
 * Get the current XP status for a user.
 *
 * @param userId - UUID of the user
 * @returns XP status including progress toward next level
 */
async function getXPStatus(userId: string): Promise<XPStatus> {
  const result = await pool.query<{ xp: number; level: number }>(
    `SELECT xp, level FROM users WHERE id = $1`,
    [userId],
  );

  if (result.rows.length === 0) {
    return { xp: 0, level: 1, xpForNextLevel: 200, xpProgress: 0 };
  }

  const { xp, level } = result.rows[0];
  const currentLevelXP = cumulativeXPForLevel(level);
  const nextLevelXP = cumulativeXPForLevel(level + 1);
  const xpForNextLevel = nextLevelXP - currentLevelXP;
  const xpProgress = xp - currentLevelXP;

  return {
    xp,
    level,
    xpForNextLevel,
    xpProgress,
  };
}

// ---------------------------------------------------------------------------
// XP amount helpers (centralized earning rules)
// ---------------------------------------------------------------------------

/** XP earned for submitting a guess. Base 10 + floor(score/10) bonus. */
function xpForGuess(score: number): number {
  return 10 + Math.floor(score / 10);
}

/** XP earned for winning a challenge. */
const XP_CHALLENGE_WIN = 25;

/** XP earned for the first game of the day. */
const XP_DAILY_FIRST_GAME = 15;

/** XP earned per achievement unlock. */
const XP_ACHIEVEMENT_UNLOCK = 20;

// ---------------------------------------------------------------------------
// Composite award helpers
// ---------------------------------------------------------------------------

/**
 * Award XP for a guess submission. Includes base guess XP and
 * a daily first-game bonus if this is the user's first guess today.
 *
 * @param userId - UUID of the user
 * @param score  - The score the user achieved (0-100)
 */
async function awardGuessXP(userId: string, score: number): Promise<void> {
  try {
    // Award base guess XP
    const guessXP = xpForGuess(score);
    await awardXP(userId, guessXP, "guess");

    // Check if this is the first guess today (count guesses submitted today)
    const dailyResult = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM guesses
       WHERE user_id = $1 AND submitted_at::date = CURRENT_DATE`,
      [userId],
    );
    const todayCount = parseInt(dailyResult.rows[0].count, 10) || 0;

    // If the count is exactly 1, this was the first guess today
    if (todayCount === 1) {
      await awardXP(userId, XP_DAILY_FIRST_GAME, "daily_first_game");
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("xp", `Failed to award guess XP for user ${userId}`, {
      userId,
      score,
      error: message,
    });
  }
}

/**
 * Award XP for winning a challenge.
 *
 * @param userId - UUID of the winning user
 */
async function awardChallengeWinXP(userId: string): Promise<void> {
  try {
    await awardXP(userId, XP_CHALLENGE_WIN, "challenge_win");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("xp", `Failed to award challenge win XP for user ${userId}`, {
      userId,
      error: message,
    });
  }
}

/**
 * Award XP for unlocking an achievement.
 *
 * @param userId - UUID of the user
 * @param achievementKey - The key of the unlocked achievement (for logging)
 */
async function awardAchievementXP(
  userId: string,
  achievementKey: string,
): Promise<void> {
  try {
    await awardXP(userId, XP_ACHIEVEMENT_UNLOCK, `achievement:${achievementKey}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("xp", `Failed to award achievement XP for user ${userId}`, {
      userId,
      achievementKey,
      error: message,
    });
  }
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const xpService = {
  awardXP,
  getXPStatus,
  xpForGuess,
  awardGuessXP,
  awardChallengeWinXP,
  awardAchievementXP,
  // Expose constants for testing/reference
  XP_CHALLENGE_WIN,
  XP_DAILY_FIRST_GAME,
  XP_ACHIEVEMENT_UNLOCK,
};
