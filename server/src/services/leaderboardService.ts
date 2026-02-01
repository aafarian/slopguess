/**
 * Leaderboard service.
 *
 * Provides methods for querying round leaderboards and individual user ranks.
 * Leaderboard entries are sorted by score DESC, with ties broken by earlier
 * submission time (submitted_at ASC).
 */

import { pool } from "../config/database";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  guessText: string;
  score: number | null;
  submittedAt: string;
}

export interface UserRankResult {
  rank: number;
  total: number;
}

// ---------------------------------------------------------------------------
// Service methods
// ---------------------------------------------------------------------------

/**
 * Get the leaderboard for a round.
 *
 * Queries guesses for the given round, JOINs with users for username,
 * orders by score DESC (ties broken by submitted_at ASC), and assigns
 * dense ranks.
 *
 * @param roundId - UUID of the round
 * @param limit - Maximum entries to return (default 50)
 * @returns Array of LeaderboardEntry ordered by rank
 */
async function getLeaderboard(
  roundId: string,
  limit: number = 50
): Promise<LeaderboardEntry[]> {
  const result = await pool.query<{
    user_id: string;
    username: string;
    guess_text: string;
    score: number | null;
    submitted_at: Date;
  }>(
    `SELECT g.user_id, u.username, g.guess_text, g.score, g.submitted_at
     FROM guesses g
     JOIN users u ON g.user_id = u.id
     WHERE g.round_id = $1
     ORDER BY g.score DESC, g.submitted_at ASC
     LIMIT $2`,
    [roundId, limit]
  );

  return result.rows.map((row, index) => ({
    rank: index + 1,
    userId: row.user_id,
    username: row.username,
    guessText: row.guess_text,
    score: row.score,
    submittedAt:
      row.submitted_at instanceof Date
        ? row.submitted_at.toISOString()
        : String(row.submitted_at),
  }));
}

/**
 * Get a specific user's rank and total guess count for a round.
 *
 * @param roundId - UUID of the round
 * @param userId - UUID of the user
 * @returns Object with rank and total, or null if the user has no guess in this round
 */
async function getUserRank(
  roundId: string,
  userId: string
): Promise<UserRankResult | null> {
  // Get the user's score for this round
  const userResult = await pool.query<{ score: number | null }>(
    `SELECT score FROM guesses WHERE round_id = $1 AND user_id = $2`,
    [roundId, userId]
  );

  if (userResult.rows.length === 0) {
    return null;
  }

  const userScore = userResult.rows[0].score;

  // Count how many guesses scored higher (rank = count of higher scores + 1)
  const rankResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM guesses
     WHERE round_id = $1 AND score > $2`,
    [roundId, userScore]
  );

  const totalResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM guesses WHERE round_id = $1`,
    [roundId]
  );

  return {
    rank: parseInt(rankResult.rows[0].count, 10) + 1,
    total: parseInt(totalResult.rows[0].count, 10),
  };
}

/**
 * Get round statistics: average score, total guesses, highest score, lowest score.
 *
 * @param roundId - UUID of the round
 * @returns Stats object, or null if no guesses exist for the round
 */
async function getRoundStats(roundId: string): Promise<{
  totalGuesses: number;
  averageScore: number;
  highestScore: number;
  lowestScore: number;
} | null> {
  const result = await pool.query<{
    total_guesses: string;
    avg_score: string | null;
    max_score: number | null;
    min_score: number | null;
  }>(
    `SELECT
       COUNT(*) AS total_guesses,
       AVG(score) AS avg_score,
       MAX(score) AS max_score,
       MIN(score) AS min_score
     FROM guesses
     WHERE round_id = $1`,
    [roundId]
  );

  const row = result.rows[0];
  const totalGuesses = parseInt(row.total_guesses, 10);

  if (totalGuesses === 0) {
    return null;
  }

  return {
    totalGuesses,
    averageScore: Math.round(parseFloat(row.avg_score ?? "0")),
    highestScore: row.max_score ?? 0,
    lowestScore: row.min_score ?? 0,
  };
}

/**
 * Get a user's game history (their guesses with round info), paginated.
 *
 * @param userId - UUID of the user
 * @param page - Page number (1-indexed)
 * @param limit - Items per page
 * @returns Array of history entries and total count
 */
async function getUserHistory(
  userId: string,
  page: number = 1,
  limit: number = 10
): Promise<{
  entries: Array<{
    roundId: string;
    imageUrl: string | null;
    guessText: string;
    score: number | null;
    rank: number;
    totalGuesses: number;
    roundPrompt: string | null;
    roundStatus: string;
    submittedAt: string;
  }>;
  total: number;
}> {
  const offset = (page - 1) * limit;

  // Get total count
  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM guesses WHERE user_id = $1`,
    [userId]
  );
  const total = parseInt(countResult.rows[0].count, 10);

  // Get paginated history with round info and rank
  const result = await pool.query<{
    round_id: string;
    image_url: string | null;
    guess_text: string;
    score: number | null;
    round_prompt: string;
    round_status: string;
    submitted_at: Date;
    rank: string;
    total_guesses: string;
  }>(
    `SELECT
       g.round_id,
       r.image_url,
       g.guess_text,
       g.score,
       r.prompt AS round_prompt,
       r.status AS round_status,
       g.submitted_at,
       (SELECT COUNT(*) + 1 FROM guesses g2
        WHERE g2.round_id = g.round_id AND g2.score > g.score) AS rank,
       (SELECT COUNT(*) FROM guesses g3
        WHERE g3.round_id = g.round_id) AS total_guesses
     FROM guesses g
     JOIN rounds r ON g.round_id = r.id
     WHERE g.user_id = $1
     ORDER BY g.submitted_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );

  return {
    entries: result.rows.map((row) => ({
      roundId: row.round_id,
      imageUrl: row.image_url,
      guessText: row.guess_text,
      score: row.score,
      rank: parseInt(row.rank, 10),
      totalGuesses: parseInt(row.total_guesses, 10),
      // Only reveal prompt for completed rounds
      roundPrompt: row.round_status === "completed" ? row.round_prompt : null,
      roundStatus: row.round_status,
      submittedAt:
        row.submitted_at instanceof Date
          ? row.submitted_at.toISOString()
          : String(row.submitted_at),
    })),
    total,
  };
}

/**
 * Get a user's aggregate statistics.
 *
 * @param userId - UUID of the user
 * @returns Stats object
 */
async function getUserStats(userId: string): Promise<{
  totalRoundsPlayed: number;
  averageScore: number;
  bestScore: number;
  worstScore: number;
  averageRank: number;
}> {
  // Basic stats from guesses
  const result = await pool.query<{
    total_rounds: string;
    avg_score: string | null;
    best_score: number | null;
    worst_score: number | null;
  }>(
    `SELECT
       COUNT(*) AS total_rounds,
       AVG(score) AS avg_score,
       MAX(score) AS best_score,
       MIN(score) AS worst_score
     FROM guesses
     WHERE user_id = $1`,
    [userId]
  );

  const row = result.rows[0];
  const totalRoundsPlayed = parseInt(row.total_rounds, 10);

  if (totalRoundsPlayed === 0) {
    return {
      totalRoundsPlayed: 0,
      averageScore: 0,
      bestScore: 0,
      worstScore: 0,
      averageRank: 0,
    };
  }

  // Calculate average rank across all rounds played
  const rankResult = await pool.query<{ avg_rank: string | null }>(
    `SELECT AVG(user_rank) AS avg_rank FROM (
       SELECT (
         SELECT COUNT(*) + 1 FROM guesses g2
         WHERE g2.round_id = g.round_id AND g2.score > g.score
       ) AS user_rank
       FROM guesses g
       WHERE g.user_id = $1
     ) ranks`,
    [userId]
  );

  return {
    totalRoundsPlayed,
    averageScore: Math.round(parseFloat(row.avg_score ?? "0")),
    bestScore: row.best_score ?? 0,
    worstScore: row.worst_score ?? 0,
    averageRank: parseFloat(
      parseFloat(rankResult.rows[0].avg_rank ?? "0").toFixed(1)
    ),
  };
}

export const leaderboardService = {
  getLeaderboard,
  getUserRank,
  getRoundStats,
  getUserHistory,
  getUserStats,
};
