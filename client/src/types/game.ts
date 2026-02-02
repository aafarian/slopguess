/**
 * Shared game-related types used across the frontend.
 * These mirror the exact shapes returned by the backend API.
 */

// ---------------------------------------------------------------------------
// Round status
// ---------------------------------------------------------------------------

/** Round lifecycle status — matches server RoundStatus. */
export type RoundStatus = 'pending' | 'active' | 'completed';

// ---------------------------------------------------------------------------
// Round types
// ---------------------------------------------------------------------------

/** Public round shape as returned by the API (prompt hidden unless user has guessed). */
export interface Round {
  id: string;
  imageUrl: string | null;
  status: RoundStatus;
  startedAt: string | null;
  endedAt: string | null;
  guessCount: number;
  prompt?: string;
  difficulty?: string;
  wordCount?: number;
}

/** Completed round — extends Round with the revealed prompt. */
export interface CompletedRound extends Round {
  prompt: string;
}

// ---------------------------------------------------------------------------
// Active round
// ---------------------------------------------------------------------------

/** Response from GET /api/rounds/active. */
export interface ActiveRoundResponse {
  round: Round;
  hasGuessed?: boolean;
  userScore?: number | null;
  /** The user's guess text (if they've already guessed). */
  userGuessText?: string | null;
  /** Dev-only: element scores for the user's guess (present when NODE_ENV !== 'production'). */
  elementScores?: ElementScoreBreakdown | null;
}

// ---------------------------------------------------------------------------
// Guess submission / result
// ---------------------------------------------------------------------------

/** Breakdown of element-level scoring from the hybrid scoring service. */
export interface ElementScoreBreakdown {
  matchedWords: string[];
  partialMatches: { word: string; similarity: number }[];
  elementScore: number;
  overallScore: number;
}

/** Payload for POST /api/rounds/:roundId/guess. */
export interface GuessSubmission {
  guess: string;
}

/** Response from POST /api/rounds/:roundId/guess. */
export interface GuessResult {
  guessId: string;
  guessText: string;
  score: number | null;
  rank: number;
  totalGuesses: number;
  /** Dev-only: original prompt (present when NODE_ENV !== 'production'). */
  prompt?: string | null;
  /** Dev-only: element score breakdown (present when NODE_ENV !== 'production'). */
  elementScores?: ElementScoreBreakdown;
}

// ---------------------------------------------------------------------------
// Leaderboard
// ---------------------------------------------------------------------------

/** A single entry in a round leaderboard. */
export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  guessText?: string;
  score: number | null;
  submittedAt: string;
}

/** Response from GET /api/rounds/:roundId/leaderboard. */
export interface LeaderboardResponse {
  roundId: string;
  status: RoundStatus;
  leaderboard: LeaderboardEntry[];
}

// ---------------------------------------------------------------------------
// Round history (completed rounds archive)
// ---------------------------------------------------------------------------

/** A single item in the round history list. */
export interface RoundHistoryItem {
  id: string;
  imageUrl: string | null;
  prompt: string;
  startedAt: string | null;
  endedAt: string | null;
  totalGuesses: number;
  topScore: number | null;
}

/** Response from GET /api/rounds/history. */
export interface RoundHistoryResponse {
  rounds: RoundHistoryItem[];
  pagination: Pagination;
}

// ---------------------------------------------------------------------------
// Round detail / results
// ---------------------------------------------------------------------------

/** Stats for a completed round. */
export interface RoundStats {
  totalGuesses: number;
  averageScore: number;
  highestScore: number;
  lowestScore: number;
}

/** The current user's result in a round (if they participated). */
export interface UserRoundResult {
  guessText: string;
  score: number | null;
  elementScores: ElementScoreBreakdown | null;
  rank: number;
  total: number;
}

/** Response from GET /api/rounds/:roundId/results (completed rounds only). */
export interface RoundResultsResponse {
  round: CompletedRound;
  leaderboard: LeaderboardEntry[];
  stats: RoundStats;
  userResult?: UserRoundResult | null;
}

/** Response from GET /api/rounds/:roundId. */
export interface RoundDetailResponse {
  round: Round | CompletedRound;
  userGuess?: {
    guessText: string;
    score: number | null;
    submittedAt: string;
  } | null;
}

// ---------------------------------------------------------------------------
// User history
// ---------------------------------------------------------------------------

/** A single entry in the current user's game history. */
export interface UserHistoryEntry {
  roundId: string;
  imageUrl: string | null;
  guessText: string;
  score: number | null;
  rank: number;
  totalGuesses: number;
  roundPrompt: string | null;
  roundStatus: string;
  submittedAt: string;
}

/** Response from GET /api/users/me/history. */
export interface UserHistoryResponse {
  history: UserHistoryEntry[];
  pagination: Pagination;
}

// ---------------------------------------------------------------------------
// User stats
// ---------------------------------------------------------------------------

/** Aggregate statistics for a user. */
export interface UserStats {
  totalRoundsPlayed: number;
  averageScore: number;
  bestScore: number;
  worstScore: number;
  averageRank: number;
}

/** Response from GET /api/users/me/stats. */
export interface UserStatsResponse {
  stats: UserStats;
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

/** Pagination metadata included in paginated API responses. */
export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// ---------------------------------------------------------------------------
// Streaks
// ---------------------------------------------------------------------------

/** User streak data as returned by the API. */
export interface StreakData {
  currentStreak: number;
  longestStreak: number;
  lastPlayedDate: string | null;
}

/** Response from GET /api/users/me/streaks. */
export interface StreakResponse {
  streak: StreakData;
}

// ---------------------------------------------------------------------------
// Weekly stats
// ---------------------------------------------------------------------------

/** Weekly statistics for the current user. */
export interface WeeklyStats {
  gamesPlayed: number;
  averageScore: number;
  bestScore: number;
}

/** Response from GET /api/users/me/weekly-stats. */
export interface WeeklyStatsResponse {
  weeklyStats: WeeklyStats;
}

// ---------------------------------------------------------------------------
// Share data
// ---------------------------------------------------------------------------

/** Data for sharing a user's round result. */
export interface ShareData {
  username: string;
  score: number;
  rank: number;
  totalGuesses: number;
  roundImageUrl: string | null;
  prompt: string | null;
  roundId: string;
}
