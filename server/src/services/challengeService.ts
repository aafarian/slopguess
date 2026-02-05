/**
 * Challenge service.
 *
 * Manages the full lifecycle of 1v1 image challenges between friends.
 * A challenge is created when a user submits a prompt, which generates an
 * AI image and stores the prompt embedding. The challenged friend then
 * guesses the prompt, and their guess is scored via semantic similarity.
 *
 * Key design decisions:
 * - Only accepted friends can challenge each other (validated via friendshipService).
 * - The prompt is hidden from the challenged user until they submit a guess.
 * - Scoring reuses the same normalization constants as scoringService
 *   (floor=0.3, ceiling=1.0) for consistency.
 * - Challenges expire after 7 days of inactivity.
 * - Content filter validates prompts before image generation.
 */

import { pool } from "../config/database";
import { env } from "../config/env";
import { logger } from "../config/logger";
import type { ChallengeRow, PublicChallenge } from "../models/challenge";
import { toPublicChallenge } from "../models/challenge";
import { createEmbeddingProvider, cosineSimilarity } from "./embedding";
import { createImageProvider } from "./imageGeneration";
import { persistImage, persistImageFromBase64 } from "./imageStorage";
import { containsBlockedContent } from "./contentFilter";
import * as friendshipService from "./friendshipService";
import { notificationService } from "./notificationService";

// ---------------------------------------------------------------------------
// Constants (mirrored from scoringService for consistency)
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

/**
 * Number of days after which an active challenge expires.
 */
const CHALLENGE_EXPIRY_DAYS = 7;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Convert a raw cosine similarity value to a 0-100 integer score.
 *
 * Uses linear mapping from [SIMILARITY_FLOOR, SIMILARITY_CEILING] to [0, 100].
 * Values outside the range are clamped. Identical to scoringService.normalizeScore.
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

/**
 * Helper to look up a username by user ID.
 * Returns the username or throws if the user is not found.
 */
async function getUsernameById(userId: string): Promise<string> {
  const result = await pool.query<{ username: string }>(
    `SELECT username FROM users WHERE id = $1`,
    [userId],
  );

  if (result.rows.length === 0) {
    throw new Error(`[challengeService] User not found: ${userId}`);
  }

  return result.rows[0].username;
}

// ---------------------------------------------------------------------------
// Service methods
// ---------------------------------------------------------------------------

/**
 * Create a new challenge between two friends.
 *
 * Pipeline:
 *  1. Validate friendship exists (accepted).
 *  2. Validate prompt via content filter.
 *  3. Generate image from prompt.
 *  4. Persist image to local storage.
 *  5. Compute prompt embedding.
 *  6. Insert challenge row with status 'active'.
 *
 * @param challengerId  - UUID of the user creating the challenge
 * @param challengedId  - UUID of the user being challenged
 * @param prompt        - The prompt text for image generation
 * @returns The newly created PublicChallenge
 * @throws Error if users are not friends
 * @throws Error if the prompt fails content filtering
 */
async function createChallenge(
  challengerId: string,
  challengedId: string,
  prompt: string,
): Promise<PublicChallenge> {
  // 1. Validate friendship
  const friends = await friendshipService.areFriends(challengerId, challengedId);
  if (!friends) {
    throw new Error("[challengeService] Cannot challenge a non-friend");
  }

  // 2. Content filter
  if (containsBlockedContent(prompt)) {
    throw new Error("[challengeService] Prompt contains blocked content");
  }

  // 3. Insert challenge with 'pending' status (no image yet) — returns immediately
  const result = await pool.query<ChallengeRow>(
    `INSERT INTO challenges (challenger_id, challenged_id, prompt, status)
     VALUES ($1, $2, $3, 'pending')
     RETURNING *`,
    [challengerId, challengedId, prompt],
  );

  const row = result.rows[0];

  const [challengerUsername, challengedUsername] = await Promise.all([
    getUsernameById(challengerId),
    getUsernameById(challengedId),
  ]);

  logger.info("challengeService", `Created pending challenge ${row.id}`, {
    challengeId: row.id,
    challengerId,
    challengedId,
  });

  // 4. Process image generation in the background (fire-and-forget)
  processChallengeBackground(row.id, prompt, challengedId, challengerUsername).catch(
    (err) => {
      logger.error("challengeService", `Background processing failed for challenge ${row.id}`, {
        challengeId: row.id,
        error: err instanceof Error ? err.message : String(err),
      });
    },
  );

  return toPublicChallenge(row, challengerUsername, challengedUsername, challengerId);
}

/**
 * Background processing for a challenge: generate image, compute embedding,
 * update the challenge to 'active', and notify the challenged user.
 *
 * Runs as a fire-and-forget promise. On failure the challenge remains 'pending'
 * and can be retried or cleaned up later.
 */
async function processChallengeBackground(
  challengeId: string,
  prompt: string,
  challengedId: string,
  challengerUsername: string,
): Promise<void> {
  try {
    // Generate image
    const imageProvider = createImageProvider(env.IMAGE_PROVIDER);
    const imageResult = await imageProvider.generate(prompt, { quality: "medium" });

    // Persist image locally (GPT Image returns base64, older models return URLs)
    let imageFilename: string;
    if (imageResult.imageBase64) {
      imageFilename = await persistImageFromBase64(imageResult.imageBase64);
    } else if (imageResult.imageUrl) {
      imageFilename = await persistImage(imageResult.imageUrl);
    } else {
      throw new Error("Image generation returned no image data");
    }
    const persistedImageUrl = `/images/${imageFilename}`;

    // Compute prompt embedding
    const embeddingProvider = createEmbeddingProvider(env.EMBEDDING_PROVIDER);
    const embeddingResult = await embeddingProvider.embed(prompt);

    // Update challenge to active with image and embedding
    await pool.query(
      `UPDATE challenges
       SET image_url = $1, prompt_embedding = $2::float[], status = 'active', updated_at = NOW()
       WHERE id = $3`,
      [persistedImageUrl, toPostgresFloatArray(embeddingResult.embedding), challengeId],
    );

    logger.info("challengeService", `Challenge ${challengeId} is now active`, {
      challengeId,
    });

    // Notify the challenged user now that the image is ready
    await notificationService.addNotification(challengedId, "challenge_received", {
      fromUsername: challengerUsername,
      challengeId,
    });
  } catch (err) {
    // Mark challenge as failed so it doesn't sit in pending forever
    await pool.query(
      `UPDATE challenges SET status = 'expired', updated_at = NOW() WHERE id = $1`,
      [challengeId],
    ).catch(() => { /* best-effort */ });

    throw err;
  }
}

/**
 * Get a challenge by its ID.
 *
 * The prompt is hidden from the challenged user until the challenge
 * has been guessed or completed (enforced by toPublicChallenge).
 *
 * @param challengeId - UUID of the challenge
 * @param viewerUserId - UUID of the user viewing the challenge
 * @returns The PublicChallenge, or null if not found
 * @throws Error if the viewer is not a participant in the challenge
 */
async function getChallengeById(
  challengeId: string,
  viewerUserId: string,
): Promise<PublicChallenge | null> {
  const result = await pool.query<ChallengeRow>(
    `SELECT * FROM challenges WHERE id = $1`,
    [challengeId],
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];

  // Only participants can view
  if (row.challenger_id !== viewerUserId && row.challenged_id !== viewerUserId) {
    throw new Error("[challengeService] You are not a participant in this challenge");
  }

  const [challengerUsername, challengedUsername] = await Promise.all([
    getUsernameById(row.challenger_id),
    getUsernameById(row.challenged_id),
  ]);

  return toPublicChallenge(row, challengerUsername, challengedUsername, viewerUserId);
}

/**
 * Submit a guess for a challenge.
 *
 * Only the challenged user may guess. Computes semantic similarity between
 * the guess and the stored prompt embedding, normalizing to 0-100 using
 * the same floor/ceiling as the main game scoring.
 *
 * @param challengeId - UUID of the challenge
 * @param userId      - UUID of the user submitting the guess
 * @param guessText   - The user's guess text
 * @returns The updated PublicChallenge with score and guess
 * @throws Error if challenge not found
 * @throws Error if user is not the challenged user
 * @throws Error if challenge is not in 'active' status
 */
async function submitGuess(
  challengeId: string,
  userId: string,
  guessText: string,
): Promise<PublicChallenge> {
  // 1. Get the challenge
  const challengeResult = await pool.query<ChallengeRow>(
    `SELECT * FROM challenges WHERE id = $1`,
    [challengeId],
  );

  if (challengeResult.rows.length === 0) {
    throw new Error(`[challengeService] Challenge not found: ${challengeId}`);
  }

  const challenge = challengeResult.rows[0];

  // 2. Only the challenged user can guess
  if (challenge.challenged_id !== userId) {
    throw new Error("[challengeService] Only the challenged user can submit a guess");
  }

  // 3. Challenge must be active
  if (challenge.status !== "active") {
    throw new Error(
      `[challengeService] Cannot submit guess: challenge is '${challenge.status}' (must be 'active')`,
    );
  }

  // 4. Compute guess embedding
  const embeddingProvider = createEmbeddingProvider(env.EMBEDDING_PROVIDER);
  const guessResult = await embeddingProvider.embed(guessText);
  const guessEmbedding = guessResult.embedding;

  // 5. Compute cosine similarity
  const promptEmbedding = challenge.prompt_embedding;
  if (!promptEmbedding || promptEmbedding.length === 0) {
    throw new Error(
      `[challengeService] Challenge ${challengeId} has no prompt embedding`,
    );
  }

  const rawSimilarity = cosineSimilarity(promptEmbedding, guessEmbedding);

  // 6. Normalize to 0-100
  const score = normalizeScore(rawSimilarity);

  // 7. Update challenge: store guess, score, transition to 'guessed'
  const updateResult = await pool.query<ChallengeRow>(
    `UPDATE challenges
     SET challenged_guess = $1,
         challenged_score = $2,
         status = 'guessed',
         updated_at = NOW()
     WHERE id = $3
     RETURNING *`,
    [guessText, score, challengeId],
  );

  const updatedRow = updateResult.rows[0];

  const [challengerUsername, challengedUsername] = await Promise.all([
    getUsernameById(updatedRow.challenger_id),
    getUsernameById(updatedRow.challenged_id),
  ]);

  logger.info("challengeService", `Guess submitted for challenge ${challengeId}`, {
    challengeId,
    userId,
    score,
    similarity: rawSimilarity,
  });

  // Notify the challenger that their challenge has been guessed
  await notificationService.addNotification(updatedRow.challenger_id, "challenge_guessed", {
    fromUsername: challengedUsername,
    challengeId,
    score,
  });

  return toPublicChallenge(updatedRow, challengerUsername, challengedUsername, userId);
}

/**
 * Get pending challenges where the user is the challenged party.
 *
 * Returns active challenges awaiting the user's guess.
 *
 * @param userId - UUID of the challenged user
 * @returns Array of PublicChallenge ordered by creation date DESC
 */
async function getPendingChallenges(userId: string): Promise<PublicChallenge[]> {
  const result = await pool.query<
    ChallengeRow & { challenger_username: string; challenged_username: string }
  >(
    `SELECT c.*,
            u1.username AS challenger_username,
            u2.username AS challenged_username
     FROM challenges c
     JOIN users u1 ON u1.id = c.challenger_id
     JOIN users u2 ON u2.id = c.challenged_id
     WHERE c.challenged_id = $1
       AND c.status = 'active'
     ORDER BY c.created_at DESC`,
    [userId],
  );

  return result.rows.map((row) =>
    toPublicChallenge(row, row.challenger_username, row.challenged_username, userId),
  );
}

/**
 * Get challenges sent by the user (where the user is the challenger).
 *
 * @param userId - UUID of the challenger
 * @returns Array of PublicChallenge ordered by creation date DESC
 */
async function getSentChallenges(userId: string): Promise<PublicChallenge[]> {
  const result = await pool.query<
    ChallengeRow & { challenger_username: string; challenged_username: string }
  >(
    `SELECT c.*,
            u1.username AS challenger_username,
            u2.username AS challenged_username
     FROM challenges c
     JOIN users u1 ON u1.id = c.challenger_id
     JOIN users u2 ON u2.id = c.challenged_id
     WHERE c.challenger_id = $1
     ORDER BY c.created_at DESC`,
    [userId],
  );

  return result.rows.map((row) =>
    toPublicChallenge(row, row.challenger_username, row.challenged_username, userId),
  );
}

/**
 * Get paginated challenge history between two users.
 *
 * @param userId1    - UUID of the first user
 * @param userId2    - UUID of the second user
 * @param pagination - Object with page (1-indexed) and limit
 * @returns Object with challenges array and total count
 */
async function getChallengesBetween(
  userId1: string,
  userId2: string,
  pagination: { page: number; limit: number } = { page: 1, limit: 10 },
): Promise<{ challenges: PublicChallenge[]; total: number }> {
  const offset = (pagination.page - 1) * pagination.limit;

  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM challenges
     WHERE (challenger_id = $1 AND challenged_id = $2)
        OR (challenger_id = $2 AND challenged_id = $1)`,
    [userId1, userId2],
  );
  const total = parseInt(countResult.rows[0].count, 10);

  const result = await pool.query<
    ChallengeRow & { challenger_username: string; challenged_username: string }
  >(
    `SELECT c.*,
            u1.username AS challenger_username,
            u2.username AS challenged_username
     FROM challenges c
     JOIN users u1 ON u1.id = c.challenger_id
     JOIN users u2 ON u2.id = c.challenged_id
     WHERE (c.challenger_id = $1 AND c.challenged_id = $2)
        OR (c.challenger_id = $2 AND c.challenged_id = $1)
     ORDER BY c.created_at DESC
     LIMIT $3 OFFSET $4`,
    [userId1, userId2, pagination.limit, offset],
  );

  const challenges = result.rows.map((row) =>
    toPublicChallenge(row, row.challenger_username, row.challenged_username, userId1),
  );

  return { challenges, total };
}

/**
 * Decline a challenge.
 *
 * Only the challenged user can decline. Transitions status to 'declined'.
 *
 * @param challengeId - UUID of the challenge
 * @param userId      - UUID of the user declining
 * @returns The updated PublicChallenge
 * @throws Error if challenge not found
 * @throws Error if user is not the challenged user
 * @throws Error if challenge is not in 'active' status
 */
async function declineChallenge(
  challengeId: string,
  userId: string,
): Promise<PublicChallenge> {
  const existing = await pool.query<ChallengeRow>(
    `SELECT * FROM challenges WHERE id = $1`,
    [challengeId],
  );

  if (existing.rows.length === 0) {
    throw new Error(`[challengeService] Challenge not found: ${challengeId}`);
  }

  const row = existing.rows[0];

  if (row.challenged_id !== userId) {
    throw new Error("[challengeService] Only the challenged user can decline");
  }

  if (row.status !== "active") {
    throw new Error(
      `[challengeService] Cannot decline: challenge is '${row.status}' (must be 'active')`,
    );
  }

  const updateResult = await pool.query<ChallengeRow>(
    `UPDATE challenges
     SET status = 'declined', updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [challengeId],
  );

  const updatedRow = updateResult.rows[0];

  const [challengerUsername, challengedUsername] = await Promise.all([
    getUsernameById(updatedRow.challenger_id),
    getUsernameById(updatedRow.challenged_id),
  ]);

  logger.info("challengeService", `Challenge ${challengeId} declined by ${userId}`, {
    challengeId,
    userId,
  });

  return toPublicChallenge(updatedRow, challengerUsername, challengedUsername, userId);
}

/**
 * Expire challenges that have been active for more than CHALLENGE_EXPIRY_DAYS.
 *
 * Batch-updates all active challenges older than the expiry threshold.
 * Intended to be called periodically by the scheduler.
 *
 * @returns The number of challenges expired
 */
async function expireChallenges(): Promise<number> {
  const result = await pool.query(
    `UPDATE challenges
     SET status = 'expired', updated_at = NOW()
     WHERE status = 'active'
       AND created_at < NOW() - INTERVAL '${CHALLENGE_EXPIRY_DAYS} days'`,
  );

  const count = result.rowCount ?? 0;

  if (count > 0) {
    logger.info("challengeService", `Expired ${count} challenges`, { count });
  }

  return count;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const challengeService = {
  createChallenge,
  getChallengeById,
  submitGuess,
  getPendingChallenges,
  getSentChallenges,
  getChallengesBetween,
  declineChallenge,
  expireChallenges,
};
