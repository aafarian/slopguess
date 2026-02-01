/**
 * Scoring service.
 *
 * Computes scores for player guesses using embedding-based cosine similarity.
 * The scoring pipeline:
 *   1. Retrieve the round's prompt embedding from the database
 *   2. Compute the guess text's embedding via the embedding provider
 *   3. Calculate cosine similarity between the two embeddings
 *   4. Normalize the raw similarity to a 0-100 human-readable score
 *
 * Normalization rationale:
 *   Text embeddings rarely produce cosine similarity below ~0.3 for completely
 *   unrelated texts. We map [0.3, 1.0] linearly to [0, 100] so that:
 *     - similarity = 1.0  -> score = 100 (perfect match)
 *     - similarity = 0.65 -> score = 50  (halfway)
 *     - similarity <= 0.3 -> score = 0   (completely unrelated)
 *
 * Per FR-005, scoring is deterministic for the same input: same guess text
 * against the same prompt embedding always yields the same score.
 */

import { pool } from "../config/database";
import { env } from "../config/env";
import { logger } from "../config/logger";
import type { RoundRow } from "../models/round";
import type { GuessRow, Guess, PublicGuess, ElementScoreBreakdown } from "../models/guess";
import { toGuess } from "../models/guess";
import { createEmbeddingProvider, cosineSimilarity } from "./embedding";
import { hybridScoringService } from "./hybridScoringService";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Lower bound of the cosine similarity range used for score normalization.
 * Text embeddings rarely go below this value for unrelated inputs.
 */
const SIMILARITY_FLOOR = 0.3;

/**
 * Upper bound of the cosine similarity range (perfect match).
 */
const SIMILARITY_CEILING = 1.0;

/**
 * Range of cosine similarity values mapped to [0, 100].
 */
const SIMILARITY_RANGE = SIMILARITY_CEILING - SIMILARITY_FLOOR;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Convert a raw cosine similarity value to a 0-100 integer score.
 *
 * Uses linear mapping from [SIMILARITY_FLOOR, SIMILARITY_CEILING] to [0, 100].
 * Values outside the range are clamped.
 *
 * @param rawSimilarity - Cosine similarity value (typically -1 to 1)
 * @returns Integer score between 0 and 100
 */
function normalizeScore(rawSimilarity: number): number {
  const normalized = (rawSimilarity - SIMILARITY_FLOOR) / SIMILARITY_RANGE;
  const clamped = Math.max(0, Math.min(1, normalized));
  return Math.round(clamped * 100);
}

/**
 * Convert a number[] embedding to a PostgreSQL FLOAT[] literal string.
 * PostgreSQL expects the format: {1.0,2.0,3.0}
 */
function toPostgresFloatArray(embedding: number[]): string {
  return `{${embedding.join(",")}}`;
}

// ---------------------------------------------------------------------------
// Scoring functions
// ---------------------------------------------------------------------------

/**
 * Score a guess against a round's prompt.
 *
 * Computes the embedding-based cosine similarity between the guess text
 * and the round's prompt, then normalizes to a 0-100 score.
 *
 * If the round does not yet have a prompt_embedding (defensive), this
 * method computes and stores it before scoring.
 *
 * @param roundId - UUID of the round to score against
 * @param guessText - The player's guess text
 * @returns Object containing the normalized score, raw similarity, and guess embedding
 * @throws Error if the round is not found
 */
async function scoreGuess(
  roundId: string,
  guessText: string
): Promise<{
  score: number;
  embeddingSimilarity: number;
  guessEmbedding: number[];
  elementBreakdown: ElementScoreBreakdown;
}> {
  // 1. Get the round from DB
  const roundResult = await pool.query<RoundRow>(
    `SELECT * FROM rounds WHERE id = $1`,
    [roundId]
  );

  if (roundResult.rows.length === 0) {
    throw new Error(`[scoringService] Round not found: ${roundId}`);
  }

  const round = roundResult.rows[0];
  let promptEmbedding = round.prompt_embedding;

  // 2. Defensive: compute and store prompt embedding if missing
  if (!promptEmbedding || promptEmbedding.length === 0) {
    const embeddingProvider = createEmbeddingProvider(env.EMBEDDING_PROVIDER);
    const promptResult = await embeddingProvider.embed(round.prompt);
    promptEmbedding = promptResult.embedding;

    // Store it so we don't have to recompute
    await pool.query(
      `UPDATE rounds SET prompt_embedding = $1::float[] WHERE id = $2`,
      [toPostgresFloatArray(promptEmbedding), roundId]
    );

    logger.info("scoringService", `Computed and stored missing prompt embedding for round ${roundId}`, { roundId });
  }

  // 3. Compute the guess embedding
  const embeddingProvider = createEmbeddingProvider(env.EMBEDDING_PROVIDER);
  const guessResult = await embeddingProvider.embed(guessText);
  const guessEmbedding = guessResult.embedding;

  // 4. Calculate cosine similarity
  const rawSimilarity = cosineSimilarity(promptEmbedding, guessEmbedding);

  // 5. Normalize to 0-100 score
  const score = normalizeScore(rawSimilarity);

  // 6. Compute element-level breakdown (augments, does not replace cosine score)
  const elementBreakdown = await hybridScoringService.computeElementBreakdown(
    round.prompt,
    guessText,
    score
  );

  return {
    score,
    embeddingSimilarity: rawSimilarity,
    guessEmbedding,
    elementBreakdown,
  };
}

/**
 * Score a guess and save it to the database.
 *
 * Complete flow: compute score, insert into guesses table, return the saved guess.
 *
 * @param roundId - UUID of the round
 * @param userId - UUID of the player submitting the guess
 * @param guessText - The player's guess text
 * @returns The saved Guess with score
 * @throws Error if the round is not found
 * @throws Error if the round is not in 'active' status
 * @throws Error if the user has already submitted a guess for this round
 */
async function scoreAndSaveGuess(
  roundId: string,
  userId: string,
  guessText: string
): Promise<Guess> {
  // 1. Verify the round exists and is active
  const roundResult = await pool.query<RoundRow>(
    `SELECT id, status FROM rounds WHERE id = $1`,
    [roundId]
  );

  if (roundResult.rows.length === 0) {
    throw new Error(`[scoringService] Round not found: ${roundId}`);
  }

  const round = roundResult.rows[0];
  if (round.status !== "active") {
    throw new Error(
      `[scoringService] Cannot submit guess: round ${roundId} is '${round.status}' (must be 'active')`
    );
  }

  // 2. Check if user already submitted a guess for this round
  const existingGuess = await pool.query(
    `SELECT id FROM guesses WHERE round_id = $1 AND user_id = $2`,
    [roundId, userId]
  );

  if (existingGuess.rows.length > 0) {
    throw new Error(
      `[scoringService] User ${userId} has already submitted a guess for round ${roundId}`
    );
  }

  // 3. Score the guess
  const { score, embeddingSimilarity, guessEmbedding, elementBreakdown } =
    await scoreGuess(roundId, guessText);

  // 4. Insert into guesses table (includes element_scores JSONB)
  const insertResult = await pool.query<GuessRow>(
    `INSERT INTO guesses (round_id, user_id, guess_text, score, embedding_similarity, guess_embedding, element_scores)
     VALUES ($1, $2, $3, $4, $5, $6::float[], $7::jsonb)
     RETURNING *`,
    [
      roundId,
      userId,
      guessText,
      score,
      embeddingSimilarity,
      toPostgresFloatArray(guessEmbedding),
      JSON.stringify(elementBreakdown),
    ]
  );

  const savedGuess = toGuess(insertResult.rows[0]);

  logger.info("scoringService", `Scored guess for round ${roundId}`, {
    roundId,
    userId,
    score,
    similarity: embeddingSimilarity,
    elementScore: elementBreakdown.elementScore,
  });

  return savedGuess;
}

/**
 * Get all scores for a round, ordered by score descending.
 *
 * Joins with the users table to include the username for each guess.
 *
 * @param roundId - UUID of the round
 * @returns Array of PublicGuess objects ordered by score (highest first)
 */
async function getRoundScores(roundId: string): Promise<PublicGuess[]> {
  const result = await pool.query<
    GuessRow & { username: string }
  >(
    `SELECT g.*, u.username
     FROM guesses g
     JOIN users u ON g.user_id = u.id
     WHERE g.round_id = $1
     ORDER BY g.score DESC, g.submitted_at ASC`,
    [roundId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    roundId: row.round_id,
    userId: row.user_id,
    username: row.username,
    guessText: row.guess_text,
    score: row.score,
    submittedAt: row.submitted_at instanceof Date
      ? row.submitted_at.toISOString()
      : String(row.submitted_at),
  }));
}

export const scoringService = {
  scoreGuess,
  scoreAndSaveGuess,
  getRoundScores,
  normalizeScore,
};
