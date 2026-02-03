/**
 * Seasonal leaderboard service.
 *
 * Provides time-based aggregated leaderboards (weekly, monthly, all-time).
 * Distinct from leaderboardService.ts which handles per-round rankings.
 *
 * After each guess, updateLeaderboardEntry is called to upsert the user's
 * weekly and monthly (and all-time) leaderboard entries.  Rankings are
 * computed at query time using window functions.
 */

import { pool } from "../config/database";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PeriodType = "weekly" | "monthly" | "all_time";

export interface SeasonalLeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  totalScore: number;
  gamesPlayed: number;
  averageScore: number;
  bestScore: number;
}

export interface UserSeasonalRank {
  rank: number;
  totalEntries: number;
  totalScore: number;
  gamesPlayed: number;
  averageScore: number;
  bestScore: number;
}

// ---------------------------------------------------------------------------
// Period key helpers
// ---------------------------------------------------------------------------

/**
 * Return the ISO week key for a given date, e.g. '2026-W05'.
 */
function currentWeekKey(date: Date = new Date()): string {
  // Calculate ISO week number
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // Set to nearest Thursday: current date + 4 - day number (make Sunday = 7)
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  // Get first day of year
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  // Calculate full weeks to nearest Thursday
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  const isoYear = d.getUTCFullYear();
  return `${isoYear}-W${String(weekNo).padStart(2, "0")}`;
}

/**
 * Return the month key for a given date, e.g. '2026-02'.
 */
function currentMonthKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/**
 * Resolve the default period key for a given period type.
 */
function defaultPeriodKey(periodType: PeriodType, date: Date = new Date()): string {
  switch (periodType) {
    case "weekly":
      return currentWeekKey(date);
    case "monthly":
      return currentMonthKey(date);
    case "all_time":
      return "all_time";
  }
}

// ---------------------------------------------------------------------------
// Service methods
// ---------------------------------------------------------------------------

/**
 * Upsert a user's leaderboard entry for a specific period.
 * Uses ON CONFLICT to atomically update aggregates.
 */
async function upsertEntry(
  userId: string,
  score: number,
  periodType: PeriodType,
  periodKey: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO leaderboard_entries (user_id, period_type, period_key, total_score, games_played, average_score, best_score)
     VALUES ($1, $2, $3, $4, 1, $4, $4)
     ON CONFLICT (user_id, period_type, period_key) DO UPDATE SET
       total_score   = leaderboard_entries.total_score + EXCLUDED.total_score,
       games_played  = leaderboard_entries.games_played + 1,
       average_score = (leaderboard_entries.total_score + EXCLUDED.total_score)::NUMERIC
                       / (leaderboard_entries.games_played + 1),
       best_score    = GREATEST(leaderboard_entries.best_score, EXCLUDED.best_score),
       updated_at    = NOW()`,
    [userId, periodType, periodKey, score],
  );
}

/**
 * Update leaderboard entries for a user after a guess.
 * Upserts weekly, monthly, and all-time rows.
 */
async function updateLeaderboardEntry(
  userId: string,
  score: number,
  date: Date = new Date(),
): Promise<void> {
  const weekKey = currentWeekKey(date);
  const monthKey = currentMonthKey(date);

  await Promise.all([
    upsertEntry(userId, score, "weekly", weekKey),
    upsertEntry(userId, score, "monthly", monthKey),
    upsertEntry(userId, score, "all_time", "all_time"),
  ]);
}

/**
 * Get ranked leaderboard for a period.
 *
 * @param periodType - 'weekly', 'monthly', or 'all_time'
 * @param periodKey  - e.g. '2026-W05', '2026-02', or 'all_time'
 * @param limit      - Max entries (default 50)
 * @param offset     - Offset for pagination (default 0)
 * @returns Array of ranked entries with usernames
 */
async function getLeaderboard(
  periodType: PeriodType,
  periodKey: string,
  limit: number = 50,
  offset: number = 0,
): Promise<SeasonalLeaderboardEntry[]> {
  const result = await pool.query<{
    rank: string;
    user_id: string;
    username: string;
    total_score: number;
    games_played: number;
    average_score: string;
    best_score: number;
  }>(
    `SELECT
       RANK() OVER (ORDER BY le.total_score DESC) AS rank,
       le.user_id,
       u.username,
       le.total_score,
       le.games_played,
       le.average_score,
       le.best_score
     FROM leaderboard_entries le
     JOIN users u ON le.user_id = u.id
     WHERE le.period_type = $1 AND le.period_key = $2
     ORDER BY le.total_score DESC
     LIMIT $3 OFFSET $4`,
    [periodType, periodKey, limit, offset],
  );

  return result.rows.map((row) => ({
    rank: parseInt(row.rank, 10),
    userId: row.user_id,
    username: row.username,
    totalScore: row.total_score,
    gamesPlayed: row.games_played,
    averageScore: parseFloat(parseFloat(row.average_score).toFixed(2)),
    bestScore: row.best_score,
  }));
}

/**
 * Get a specific user's rank and stats for a period.
 *
 * @returns The user's rank info, or null if they have no entry for this period
 */
async function getUserRank(
  userId: string,
  periodType: PeriodType,
  periodKey: string,
): Promise<UserSeasonalRank | null> {
  // First check if user has an entry
  const entryResult = await pool.query<{
    total_score: number;
    games_played: number;
    average_score: string;
    best_score: number;
  }>(
    `SELECT total_score, games_played, average_score, best_score
     FROM leaderboard_entries
     WHERE user_id = $1 AND period_type = $2 AND period_key = $3`,
    [userId, periodType, periodKey],
  );

  if (entryResult.rows.length === 0) {
    return null;
  }

  const entry = entryResult.rows[0];

  // Count how many users have a higher total_score (rank = count + 1)
  const rankResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM leaderboard_entries
     WHERE period_type = $1 AND period_key = $2 AND total_score > $3`,
    [periodType, periodKey, entry.total_score],
  );

  const totalResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM leaderboard_entries
     WHERE period_type = $1 AND period_key = $2`,
    [periodType, periodKey],
  );

  return {
    rank: parseInt(rankResult.rows[0].count, 10) + 1,
    totalEntries: parseInt(totalResult.rows[0].count, 10),
    totalScore: entry.total_score,
    gamesPlayed: entry.games_played,
    averageScore: parseFloat(parseFloat(entry.average_score).toFixed(2)),
    bestScore: entry.best_score,
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const seasonalLeaderboardService = {
  updateLeaderboardEntry,
  getLeaderboard,
  getUserRank,
  currentWeekKey,
  currentMonthKey,
  defaultPeriodKey,
};
