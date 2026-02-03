/**
 * Achievements service — typed wrappers around the /api/achievements endpoints.
 */

import { request } from './api';
import type { AchievementsResponse, RecentAchievementsResponse, XPStatusResponse } from '../types/achievement';

/**
 * Fetch all achievements with the current user's unlock status.
 * Requires authentication.
 *
 * GET /api/achievements
 */
export async function fetchAchievements(): Promise<AchievementsResponse> {
  return request<AchievementsResponse>('/api/achievements');
}

/**
 * Fetch recently unlocked achievements (last 7 days).
 * Requires authentication.
 *
 * GET /api/achievements/recent
 */
export async function fetchRecentAchievements(): Promise<RecentAchievementsResponse> {
  return request<RecentAchievementsResponse>('/api/achievements/recent');
}

/**
 * Fetch the current user's XP status (level, progress toward next level).
 * Requires authentication.
 *
 * GET /api/achievements/xp
 */
export async function fetchXPStatus(): Promise<XPStatusResponse> {
  return request<XPStatusResponse>('/api/achievements/xp');
}
