/**
 * Guess model types.
 * Defines the database row shape and public shapes for player guesses.
 *
 * A guess is a player's attempt to identify the prompt that was used to
 * generate the AI image in a given round.
 */

/** Breakdown of element-level scoring from the hybrid scoring service. */
export interface ElementScoreBreakdown {
  matchedWords: string[];
  partialMatches: { word: string; similarity: number }[];
  elementScore: number;
  overallScore: number;
}

/** Full guess row as stored in PostgreSQL. */
export interface GuessRow {
  id: string;
  round_id: string;
  user_id: string;
  guess_text: string;
  score: number | null;
  embedding_similarity: number | null;
  guess_embedding: number[] | null;
  element_scores: Record<string, unknown> | null;
  submitted_at: Date;
  created_at: Date;
}

/** CamelCase guess for application use. */
export interface Guess {
  id: string;
  roundId: string;
  userId: string;
  guessText: string;
  score: number | null;
  embeddingSimilarity: number | null;
  guessEmbedding: number[] | null;
  elementScores: ElementScoreBreakdown | null;
  submittedAt: Date;
  createdAt: Date;
}

/**
 * Public guess returned by API responses.
 * Includes the username (joined from users table) and excludes raw embeddings.
 */
export interface PublicGuess {
  id: string;
  roundId: string;
  userId: string;
  username: string;
  guessText: string;
  score: number | null;
  elementScores?: ElementScoreBreakdown | null;
  submittedAt: string;
}

/** Convert a database row to a Guess. */
export function toGuess(row: GuessRow): Guess {
  return {
    id: row.id,
    roundId: row.round_id,
    userId: row.user_id,
    guessText: row.guess_text,
    score: row.score,
    embeddingSimilarity: row.embedding_similarity,
    guessEmbedding: row.guess_embedding,
    elementScores: row.element_scores as ElementScoreBreakdown | null,
    submittedAt: row.submitted_at,
    createdAt: row.created_at,
  };
}

/**
 * Convert a Guess to a PublicGuess.
 * Requires the username to be provided (from a join or separate lookup).
 */
export function toPublicGuess(guess: Guess, username: string): PublicGuess {
  return {
    id: guess.id,
    roundId: guess.roundId,
    userId: guess.userId,
    username,
    guessText: guess.guessText,
    score: guess.score,
    submittedAt: guess.submittedAt.toISOString(),
  };
}
