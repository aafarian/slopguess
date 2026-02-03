/**
 * Leaderboard service -- typed wrappers around the /api/leaderboards endpoints.
 *
 * These endpoints serve time-based aggregated leaderboards (weekly, monthly).
 * Distinct from getRoundLeaderboard in game.ts which is per-round.
 */

import { request } from './api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PeriodType = 'weekly' | 'monthly';

export interface SeasonalLeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  totalScore: number;
  gamesPlayed: number;
  averageScore: number;
  bestScore: number;
}

export interface SeasonalLeaderboardResponse {
  periodType: PeriodType;
  periodKey: string;
  entries: SeasonalLeaderboardEntry[];
  pagination: { limit: number; offset: number };
}

export interface UserSeasonalRank {
  periodType: PeriodType;
  periodKey: string;
  rank: number | null;
  totalEntries?: number;
  totalScore?: number;
  gamesPlayed?: number;
  averageScore?: number;
  bestScore?: number;
  message?: string;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

/**
 * Fetch the seasonal leaderboard for a given period type.
 *
 * GET /api/leaderboards/:periodType?period=...&limit=...&offset=...
 */
export async function fetchLeaderboard(
  periodType: PeriodType,
  periodKey?: string,
  limit?: number,
  offset?: number,
): Promise<SeasonalLeaderboardResponse> {
  const params = new URLSearchParams();
  if (periodKey) params.set('period', periodKey);
  if (limit !== undefined) params.set('limit', String(limit));
  if (offset !== undefined) params.set('offset', String(offset));

  const query = params.toString();
  const url = `/api/leaderboards/${periodType}${query ? `?${query}` : ''}`;
  return request<SeasonalLeaderboardResponse>(url);
}

/**
 * Fetch the current user's rank and stats for a given period.
 * Requires authentication.
 *
 * GET /api/leaderboards/:periodType/me?period=...
 */
export async function fetchMyRank(
  periodType: PeriodType,
  periodKey?: string,
): Promise<UserSeasonalRank> {
  const params = new URLSearchParams();
  if (periodKey) params.set('period', periodKey);

  const query = params.toString();
  const url = `/api/leaderboards/${periodType}/me${query ? `?${query}` : ''}`;
  return request<UserSeasonalRank>(url);
}
