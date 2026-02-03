/**
 * Client-side achievement types — mirrors the server types with camelCase conventions.
 */

/** The four achievement categories. */
export type AchievementCategory = 'score' | 'streak' | 'social' | 'volume';

/** All valid achievement keys. */
export type AchievementKey =
  // Score
  | 'first_guess'
  | 'score_50'
  | 'score_80'
  | 'score_95'
  | 'perfect_100'
  // Streak
  | 'streak_3'
  | 'streak_7'
  | 'streak_30'
  // Social
  | 'first_friend'
  | 'first_challenge'
  | 'challenge_win'
  // Volume
  | 'rounds_10'
  | 'rounds_50'
  | 'rounds_100';

/** A single achievement with the user's unlock status (returned by the API). */
export interface Achievement {
  id: string;
  key: AchievementKey;
  title: string;
  description: string;
  icon: string;
  category: AchievementCategory;
  threshold_value: number;
  unlockedAt: string | null;
}

/** Response from GET /api/achievements */
export interface AchievementsResponse {
  total: number;
  unlocked: number;
  achievements: Achievement[];
}

/** Response from GET /api/achievements/recent */
export interface RecentAchievementsResponse {
  achievements: Achievement[];
}

// ---------------------------------------------------------------------------
// XP / Level
// ---------------------------------------------------------------------------

/** XP status as returned by GET /api/achievements/xp. */
export interface XPStatus {
  xp: number;
  level: number;
  xpForNextLevel: number;
  xpProgress: number;
}

/** Response from GET /api/achievements/xp */
export type XPStatusResponse = XPStatus;
