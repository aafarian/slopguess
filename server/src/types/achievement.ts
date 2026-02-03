/**
 * Achievement system types for Slop Guesser.
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

/** A row from the achievement_definitions table. */
export interface AchievementDefinition {
  id: string;
  key: AchievementKey;
  title: string;
  description: string;
  icon: string;
  category: AchievementCategory;
  threshold_value: number;
  created_at: string;
}

/** A row from the user_achievements table. */
export interface UserAchievement {
  id: string;
  user_id: string;
  achievement_id: string;
  progress: number;
  unlocked_at: string | null;
  created_at: string;
  updated_at: string;
}

/** User achievement joined with its definition — used in API responses. */
export interface UserAchievementWithDefinition extends UserAchievement {
  key: AchievementKey;
  title: string;
  description: string;
  icon: string;
  category: AchievementCategory;
  threshold_value: number;
}

/** Summary returned by GET /achievements for the authenticated user. */
export interface AchievementSummary {
  total: number;
  unlocked: number;
  achievements: UserAchievementWithDefinition[];
}

/**
 * Context hint passed to the achievement-checking engine so it knows
 * which subset of achievements to evaluate after a game event.
 */
export type AchievementContext =
  | { type: 'guess'; score: number }
  | { type: 'streak'; count: number }
  | { type: 'friend' }
  | { type: 'challenge_sent' }
  | { type: 'challenge_won' };
