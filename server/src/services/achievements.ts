/**
 * Achievement checking service.
 *
 * Evaluates user progress against achievement definitions and unlocks
 * newly earned achievements. Called in a fire-and-forget pattern from
 * request handlers after key user actions (guessing, streaks, social).
 *
 * Design:
 *   - `checkAndUnlock(userId, context)` accepts a discriminated union context
 *     so only the relevant subset of achievements is evaluated.
 *   - Unlocks are idempotent via INSERT ... ON CONFLICT DO NOTHING.
 *   - Newly unlocked achievements trigger a notification.
 */

import { pool } from "../config/database";
import { logger } from "../config/logger";
import { notificationService } from "./notificationService";
import type { AchievementContext, AchievementDefinition, AchievementKey } from "../types/achievement";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A definition row plus the user's unlock timestamp (null if locked). */
export interface AchievementWithStatus {
  id: string;
  key: AchievementKey;
  title: string;
  description: string;
  icon: string;
  category: string;
  thresholdValue: number;
  unlockedAt: string | null;
}

/** A recently unlocked achievement. */
export interface RecentAchievement {
  id: string;
  key: AchievementKey;
  title: string;
  description: string;
  icon: string;
  category: string;
  unlockedAt: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Attempt to unlock an achievement for a user. Uses INSERT ... ON CONFLICT
 * DO NOTHING to guarantee idempotency. Returns true if a new row was
 * inserted (i.e., the achievement was just unlocked).
 */
async function tryUnlock(userId: string, achievementId: string): Promise<boolean> {
  const result = await pool.query(
    `INSERT INTO user_achievements (user_id, achievement_id, progress, unlocked_at)
     VALUES ($1, $2, 1, NOW())
     ON CONFLICT (user_id, achievement_id) DO NOTHING`,
    [userId, achievementId],
  );

  return (result.rowCount ?? 0) > 0;
}

/**
 * Load achievement definitions matching the given keys.
 */
async function getDefinitionsByKeys(keys: AchievementKey[]): Promise<AchievementDefinition[]> {
  if (keys.length === 0) return [];

  const result = await pool.query<AchievementDefinition>(
    `SELECT id, key, title, description, icon, category, threshold_value, created_at
     FROM achievement_definitions
     WHERE key = ANY($1)`,
    [keys],
  );

  return result.rows;
}

/**
 * Get the total number of guesses a user has submitted across all rounds.
 */
async function getUserGuessCount(userId: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM guesses WHERE user_id = $1`,
    [userId],
  );
  return parseInt(result.rows[0].count, 10) || 0;
}

/**
 * Get the number of accepted friends a user has.
 */
async function getUserFriendCount(userId: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM friendships
     WHERE (user_id = $1 OR friend_id = $1) AND status = 'accepted'`,
    [userId],
  );
  return parseInt(result.rows[0].count, 10) || 0;
}

/**
 * Get the number of challenges a user has sent (as challenger).
 */
async function getUserChallengeSentCount(userId: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM challenges
     WHERE challenger_id = $1`,
    [userId],
  );
  return parseInt(result.rows[0].count, 10) || 0;
}

/**
 * Check if the user has already unlocked a specific achievement.
 */
async function isAlreadyUnlocked(userId: string, achievementId: string): Promise<boolean> {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM user_achievements
     WHERE user_id = $1 AND achievement_id = $2 AND unlocked_at IS NOT NULL`,
    [userId, achievementId],
  );
  return parseInt(result.rows[0].count, 10) > 0;
}

// ---------------------------------------------------------------------------
// Context-specific checking
// ---------------------------------------------------------------------------

/**
 * Check score and volume achievements after a guess submission.
 */
async function checkGuessAchievements(
  userId: string,
  score: number,
): Promise<{ key: AchievementKey; title: string; icon: string }[]> {
  const unlocked: { key: AchievementKey; title: string; icon: string }[] = [];

  // Score-related keys to check
  const scoreKeys: AchievementKey[] = ['first_guess'];
  if (score >= 50) scoreKeys.push('score_50');
  if (score >= 80) scoreKeys.push('score_80');
  if (score >= 95) scoreKeys.push('score_95');
  if (score >= 100) scoreKeys.push('perfect_100');

  // Volume keys to check
  const volumeKeys: AchievementKey[] = ['rounds_10', 'rounds_50', 'rounds_100'];

  const allKeys = [...scoreKeys, ...volumeKeys];
  const definitions = await getDefinitionsByKeys(allKeys);

  // Get the user's total guess count for volume achievements
  const guessCount = await getUserGuessCount(userId);

  for (const def of definitions) {
    // Skip if already unlocked
    if (await isAlreadyUnlocked(userId, def.id)) continue;

    let qualifies = false;

    if (def.category === 'score') {
      // Score achievements: the current score must meet the threshold
      // first_guess has threshold 1, meaning any guess qualifies
      if (def.key === 'first_guess') {
        qualifies = true;
      } else {
        qualifies = score >= def.threshold_value;
      }
    } else if (def.category === 'volume') {
      // Volume achievements: total guess count must meet the threshold
      qualifies = guessCount >= def.threshold_value;
    }

    if (qualifies) {
      const inserted = await tryUnlock(userId, def.id);
      if (inserted) {
        unlocked.push({ key: def.key, title: def.title, icon: def.icon });
      }
    }
  }

  return unlocked;
}

/**
 * Check streak achievements after a streak update.
 */
async function checkStreakAchievements(
  userId: string,
  currentStreak: number,
): Promise<{ key: AchievementKey; title: string; icon: string }[]> {
  const unlocked: { key: AchievementKey; title: string; icon: string }[] = [];

  const streakKeys: AchievementKey[] = [];
  if (currentStreak >= 3) streakKeys.push('streak_3');
  if (currentStreak >= 7) streakKeys.push('streak_7');
  if (currentStreak >= 30) streakKeys.push('streak_30');

  if (streakKeys.length === 0) return unlocked;

  const definitions = await getDefinitionsByKeys(streakKeys);

  for (const def of definitions) {
    if (await isAlreadyUnlocked(userId, def.id)) continue;

    if (currentStreak >= def.threshold_value) {
      const inserted = await tryUnlock(userId, def.id);
      if (inserted) {
        unlocked.push({ key: def.key, title: def.title, icon: def.icon });
      }
    }
  }

  return unlocked;
}

/**
 * Check social achievements after a friend acceptance.
 */
async function checkFriendAchievements(
  userId: string,
): Promise<{ key: AchievementKey; title: string; icon: string }[]> {
  const unlocked: { key: AchievementKey; title: string; icon: string }[] = [];

  const definitions = await getDefinitionsByKeys(['first_friend']);
  if (definitions.length === 0) return unlocked;

  const def = definitions[0];
  if (await isAlreadyUnlocked(userId, def.id)) return unlocked;

  const friendCount = await getUserFriendCount(userId);
  if (friendCount >= def.threshold_value) {
    const inserted = await tryUnlock(userId, def.id);
    if (inserted) {
      unlocked.push({ key: def.key, title: def.title, icon: def.icon });
    }
  }

  return unlocked;
}

/**
 * Check social achievements after sending a challenge.
 */
async function checkChallengeSentAchievements(
  userId: string,
): Promise<{ key: AchievementKey; title: string; icon: string }[]> {
  const unlocked: { key: AchievementKey; title: string; icon: string }[] = [];

  const definitions = await getDefinitionsByKeys(['first_challenge']);
  if (definitions.length === 0) return unlocked;

  const def = definitions[0];
  if (await isAlreadyUnlocked(userId, def.id)) return unlocked;

  const sentCount = await getUserChallengeSentCount(userId);
  if (sentCount >= def.threshold_value) {
    const inserted = await tryUnlock(userId, def.id);
    if (inserted) {
      unlocked.push({ key: def.key, title: def.title, icon: def.icon });
    }
  }

  return unlocked;
}

/**
 * Check social achievements after winning a challenge.
 */
async function checkChallengeWonAchievements(
  userId: string,
): Promise<{ key: AchievementKey; title: string; icon: string }[]> {
  const unlocked: { key: AchievementKey; title: string; icon: string }[] = [];

  const definitions = await getDefinitionsByKeys(['challenge_win']);
  if (definitions.length === 0) return unlocked;

  const def = definitions[0];
  if (await isAlreadyUnlocked(userId, def.id)) return unlocked;

  // If this is called, the user just won a challenge — threshold is 1
  const inserted = await tryUnlock(userId, def.id);
  if (inserted) {
    unlocked.push({ key: def.key, title: def.title, icon: def.icon });
  }

  return unlocked;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check and unlock achievements for a user based on a game event context.
 *
 * This is the main entry point. It dispatches to context-specific checkers
 * and creates notifications for any newly unlocked achievements.
 *
 * @param userId - UUID of the user
 * @param context - Discriminated union describing the event that triggered the check
 * @returns Array of newly unlocked achievement keys (empty if none)
 */
async function checkAndUnlock(
  userId: string,
  context: AchievementContext,
): Promise<{ key: AchievementKey; title: string; icon: string }[]> {
  try {
    let unlocked: { key: AchievementKey; title: string; icon: string }[] = [];

    switch (context.type) {
      case 'guess':
        unlocked = await checkGuessAchievements(userId, context.score);
        break;

      case 'streak':
        unlocked = await checkStreakAchievements(userId, context.count);
        break;

      case 'friend':
        unlocked = await checkFriendAchievements(userId);
        break;

      case 'challenge_sent':
        unlocked = await checkChallengeSentAchievements(userId);
        break;

      case 'challenge_won':
        unlocked = await checkChallengeWonAchievements(userId);
        break;
    }

    // Send notifications for each newly unlocked achievement
    for (const achievement of unlocked) {
      await notificationService.addNotification(userId, 'achievement_unlocked', {
        achievementKey: achievement.key,
        title: achievement.title,
        icon: achievement.icon,
      });
    }

    if (unlocked.length > 0) {
      logger.info("achievements", `Unlocked ${unlocked.length} achievement(s) for user ${userId}`, {
        userId,
        context: context.type,
        unlocked: unlocked.map((a) => a.key),
      });
    }

    return unlocked;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("achievements", `Failed to check achievements for user ${userId}`, {
      userId,
      context: context.type,
      error: message,
    });
    return [];
  }
}

/**
 * Get all 14 achievement definitions with the user's unlock status.
 *
 * Uses a LEFT JOIN so locked achievements appear with unlockedAt = null.
 *
 * @param userId - UUID of the user
 * @returns Array of all achievements with unlock status
 */
async function getUserAchievements(userId: string): Promise<AchievementWithStatus[]> {
  const result = await pool.query<{
    id: string;
    key: AchievementKey;
    title: string;
    description: string;
    icon: string;
    category: string;
    threshold_value: number;
    unlocked_at: string | null;
  }>(
    `SELECT
       ad.id,
       ad.key,
       ad.title,
       ad.description,
       ad.icon,
       ad.category,
       ad.threshold_value,
       ua.unlocked_at
     FROM achievement_definitions ad
     LEFT JOIN user_achievements ua
       ON ua.achievement_id = ad.id AND ua.user_id = $1
     ORDER BY ad.category, ad.threshold_value`,
    [userId],
  );

  return result.rows.map((row) => ({
    id: row.id,
    key: row.key,
    title: row.title,
    description: row.description,
    icon: row.icon,
    category: row.category,
    thresholdValue: row.threshold_value,
    unlockedAt: row.unlocked_at
      ? new Date(row.unlocked_at).toISOString()
      : null,
  }));
}

/**
 * Get achievements unlocked in the last 7 days.
 *
 * @param userId - UUID of the user
 * @returns Array of recently unlocked achievements
 */
async function getRecentlyUnlocked(userId: string): Promise<RecentAchievement[]> {
  const result = await pool.query<{
    id: string;
    key: AchievementKey;
    title: string;
    description: string;
    icon: string;
    category: string;
    unlocked_at: string;
  }>(
    `SELECT
       ad.id,
       ad.key,
       ad.title,
       ad.description,
       ad.icon,
       ad.category,
       ua.unlocked_at
     FROM user_achievements ua
     JOIN achievement_definitions ad ON ad.id = ua.achievement_id
     WHERE ua.user_id = $1
       AND ua.unlocked_at IS NOT NULL
       AND ua.unlocked_at >= NOW() - INTERVAL '7 days'
     ORDER BY ua.unlocked_at DESC`,
    [userId],
  );

  return result.rows.map((row) => ({
    id: row.id,
    key: row.key,
    title: row.title,
    description: row.description,
    icon: row.icon,
    category: row.category,
    unlockedAt: new Date(row.unlocked_at).toISOString(),
  }));
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const achievementService = {
  checkAndUnlock,
  getUserAchievements,
  getRecentlyUnlocked,
};
