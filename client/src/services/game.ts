/**
 * Game service — typed wrappers around the /api/rounds and /api/users game endpoints.
 */

import { request } from './api';
import type {
  ActiveRoundResponse,
  GuessResult,
  RoundHistoryResponse,
  RoundDetailResponse,
  LeaderboardResponse,
  RoundResultsResponse,
  UserHistoryResponse,
  UserStatsResponse,
} from '../types/game';

/**
 * Fetch the current active round.
 * Returns round info; if authenticated, also includes hasGuessed and userScore.
 *
 * GET /api/rounds/active
 */
export async function getActiveRound(): Promise<ActiveRoundResponse> {
  return request<ActiveRoundResponse>('/api/rounds/active');
}

/**
 * Submit a guess for a round.
 * Requires authentication.
 *
 * POST /api/rounds/:roundId/guess
 */
export async function submitGuess(
  roundId: string,
  guess: string,
): Promise<GuessResult> {
  return request<GuessResult>(`/api/rounds/${roundId}/guess`, {
    method: 'POST',
    body: JSON.stringify({ guess }),
  });
}

/**
 * Fetch paginated list of completed rounds.
 *
 * GET /api/rounds/history
 */
export async function getRoundHistory(
  page?: number,
  limit?: number,
): Promise<RoundHistoryResponse> {
  const params = new URLSearchParams();
  if (page !== undefined) params.set('page', String(page));
  if (limit !== undefined) params.set('limit', String(limit));

  const query = params.toString();
  const url = `/api/rounds/history${query ? `?${query}` : ''}`;
  return request<RoundHistoryResponse>(url);
}

/**
 * Fetch a specific round by ID.
 * If authenticated, includes the user's guess info.
 *
 * GET /api/rounds/:roundId
 */
export async function getRound(roundId: string): Promise<RoundDetailResponse> {
  return request<RoundDetailResponse>(`/api/rounds/${roundId}`);
}

/**
 * Fetch the leaderboard for a specific round.
 *
 * GET /api/rounds/:roundId/leaderboard
 */
export async function getRoundLeaderboard(
  roundId: string,
): Promise<LeaderboardResponse> {
  return request<LeaderboardResponse>(`/api/rounds/${roundId}/leaderboard`);
}

/**
 * Fetch full results for a completed round.
 * Includes leaderboard, stats, and optionally the current user's result.
 *
 * GET /api/rounds/:roundId/results
 */
export async function getRoundResults(
  roundId: string,
): Promise<RoundResultsResponse> {
  return request<RoundResultsResponse>(`/api/rounds/${roundId}/results`);
}

/**
 * Fetch the current user's game history (paginated).
 * Requires authentication.
 *
 * GET /api/users/me/history
 */
export async function getUserHistory(
  page?: number,
  limit?: number,
): Promise<UserHistoryResponse> {
  const params = new URLSearchParams();
  if (page !== undefined) params.set('page', String(page));
  if (limit !== undefined) params.set('limit', String(limit));

  const query = params.toString();
  const url = `/api/users/me/history${query ? `?${query}` : ''}`;
  return request<UserHistoryResponse>(url);
}

/**
 * Fetch the current user's aggregate statistics.
 * Requires authentication.
 *
 * GET /api/users/me/stats
 */
export async function getUserStats(): Promise<UserStatsResponse> {
  return request<UserStatsResponse>('/api/users/me/stats');
}
