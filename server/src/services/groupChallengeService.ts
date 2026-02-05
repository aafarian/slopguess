/**
 * Group challenge service.
 *
 * Manages the full lifecycle of group challenges (3+ player challenges).
 * A group challenge is created when a user submits a prompt, which generates
 * an AI image and stores the prompt embedding. Multiple friends (2-10) are
 * invited to guess the prompt, and each guess is scored via semantic similarity.
 *
 * Key design decisions:
 * - The creator writes the prompt and is NOT a participant who guesses.
 * - All participants must be accepted friends of the creator.
 * - Participants can join, guess, or decline.
 * - The prompt is hidden from participants until they have guessed.
 * - Scoring reuses the same normalization constants as challengeService
 *   (floor=0.3, ceiling=1.0) for consistency.
 * - Auto-completes when all joined participants have guessed or declined.
 * - Group challenges expire after 7 days of inactivity.
 * - Content filter validates prompts before image generation.
 */

import { pool } from "../config/database";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { createEmbeddingProvider, cosineSimilarity } from "./embedding";
import { createImageProvider } from "./imageGeneration";
import { persistImage, persistImageFromBase64 } from "./imageStorage";
import { containsBlockedContent } from "./contentFilter";
import * as friendshipService from "./friendshipService";
import { notificationService } from "./notificationService";

// ---------------------------------------------------------------------------
// Constants (mirrored from challengeService/scoringService for consistency)
// ---------------------------------------------------------------------------

const SIMILARITY_FLOOR = 0.3;
const SIMILARITY_CEILING = 1.0;
const SIMILARITY_RANGE = SIMILARITY_CEILING - SIMILARITY_FLOOR;
const GROUP_CHALLENGE_EXPIRY_DAYS = 7;
const MIN_PARTICIPANTS = 2;
const MAX_PARTICIPANTS = 10;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Group challenge lifecycle status. */
export type GroupChallengeStatus =
  | "pending"
  | "active"
  | "scoring"
  | "completed"
  | "expired";

/** Participant status within a group challenge. */
export type ParticipantStatus = "pending" | "joined" | "guessed" | "declined";

/** Full group_challenges row as stored in PostgreSQL. */
export interface GroupChallengeRow {
  id: string;
  creator_id: string;
  prompt: string;
  image_url: string | null;
  prompt_embedding: number[] | null;
  status: GroupChallengeStatus;
  created_at: Date;
  updated_at: Date;
}

/** Full group_challenge_participants row as stored in PostgreSQL. */
export interface GroupChallengeParticipantRow {
  id: string;
  group_challenge_id: string;
  user_id: string;
  guess_text: string | null;
  score: number | null;
  status: ParticipantStatus;
  created_at: Date;
  updated_at: Date;
}

/** Public participant shape returned by API responses. */
export interface PublicParticipant {
  id: string;
  userId: string;
  username: string;
  guessText: string | null;
  score: number | null;
  status: ParticipantStatus;
}

/** Public group challenge returned by API responses. */
export interface PublicGroupChallenge {
  id: string;
  creatorId: string;
  creatorUsername: string;
  imageUrl: string | null;
  status: GroupChallengeStatus;
  participants: PublicParticipant[];
  createdAt: string;
  updatedAt: string;
  prompt?: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Convert a raw cosine similarity value to a 0-100 integer score.
 * Uses the same linear mapping as challengeService.
 */
function normalizeScore(rawSimilarity: number): number {
  const normalized = (rawSimilarity - SIMILARITY_FLOOR) / SIMILARITY_RANGE;
  const clamped = Math.max(0, Math.min(1, normalized));
  return Math.round(clamped * 100);
}

/**
 * Convert a number[] embedding to a PostgreSQL FLOAT[] literal string.
 */
function toPostgresFloatArray(embedding: number[]): string {
  return `{${embedding.join(",")}}`;
}

/**
 * Helper to look up a username by user ID.
 */
async function getUsernameById(userId: string): Promise<string> {
  const result = await pool.query<{ username: string }>(
    `SELECT username FROM users WHERE id = $1`,
    [userId],
  );

  if (result.rows.length === 0) {
    throw new Error(`[groupChallengeService] User not found: ${userId}`);
  }

  return result.rows[0].username;
}

/**
 * Convert a GroupChallengeRow + participants to a PublicGroupChallenge.
 *
 * The prompt is visible to the creator always, and to participants only
 * after they have guessed. Each participant can only see other
 * participants' guesses after they themselves have guessed.
 */
function toPublicGroupChallenge(
  row: GroupChallengeRow,
  creatorUsername: string,
  participants: Array<GroupChallengeParticipantRow & { username: string }>,
  viewerUserId: string,
): PublicGroupChallenge {
  const isCreator = viewerUserId === row.creator_id;
  const viewerParticipant = participants.find((p) => p.user_id === viewerUserId);
  const viewerHasGuessed = viewerParticipant?.status === "guessed";
  const isCompleted = row.status === "completed";

  // Creator always sees prompt; participants see it after guessing or completion
  const showPrompt = isCreator || viewerHasGuessed || isCompleted;

  // Map participants — hide guess details from participants who haven't guessed yet
  const publicParticipants: PublicParticipant[] = participants.map((p) => {
    const canSeeDetails = isCreator || viewerHasGuessed || isCompleted;
    return {
      id: p.id,
      userId: p.user_id,
      username: p.username,
      guessText: canSeeDetails ? p.guess_text : null,
      score: canSeeDetails ? p.score : null,
      status: p.status,
    };
  });

  const result: PublicGroupChallenge = {
    id: row.id,
    creatorId: row.creator_id,
    creatorUsername,
    imageUrl: row.image_url,
    status: row.status,
    participants: publicParticipants,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at),
  };

  if (showPrompt) {
    result.prompt = row.prompt;
  }

  return result;
}

/**
 * Check whether all active participants have resolved (guessed or declined).
 * If so, transition the group challenge to 'completed'.
 */
async function maybeCompleteChallenge(challengeId: string): Promise<void> {
  // Count participants who are still pending or joined (haven't resolved yet)
  const result = await pool.query<{ unresolved: string }>(
    `SELECT COUNT(*)::text AS unresolved
     FROM group_challenge_participants
     WHERE group_challenge_id = $1
       AND status IN ('pending', 'joined')`,
    [challengeId],
  );

  const unresolved = parseInt(result.rows[0].unresolved, 10);

  if (unresolved === 0) {
    await pool.query(
      `UPDATE group_challenges
       SET status = 'completed', updated_at = NOW()
       WHERE id = $1 AND status IN ('active', 'scoring')`,
      [challengeId],
    );

    logger.info(
      "groupChallengeService",
      `Group challenge ${challengeId} auto-completed (all participants resolved)`,
      { challengeId },
    );
  }
}

// ---------------------------------------------------------------------------
// Background processing
// ---------------------------------------------------------------------------

/**
 * Background processing for a group challenge: generate image, compute
 * embedding, update status to 'active', and notify participants.
 *
 * Runs as a fire-and-forget promise. On failure, the challenge remains
 * 'pending' and can be retried or cleaned up later.
 */
async function processGroupChallengeBackground(
  challengeId: string,
  prompt: string,
  participantIds: string[],
  creatorUsername: string,
): Promise<void> {
  try {
    // Generate image
    const imageProvider = createImageProvider(env.IMAGE_PROVIDER);
    const imageResult = await imageProvider.generate(prompt, { quality: "medium" });

    // Persist image (to R2 if configured, otherwise locally)
    let persistedImageUrl: string;
    if (imageResult.imageBase64) {
      persistedImageUrl = await persistImageFromBase64(imageResult.imageBase64);
    } else if (imageResult.imageUrl) {
      persistedImageUrl = await persistImage(imageResult.imageUrl);
    } else {
      throw new Error("Image generation returned no image data");
    }

    // Compute prompt embedding
    const embeddingProvider = createEmbeddingProvider(env.EMBEDDING_PROVIDER);
    const embeddingResult = await embeddingProvider.embed(prompt);

    // Update challenge to active with image and embedding
    await pool.query(
      `UPDATE group_challenges
       SET image_url = $1, prompt_embedding = $2::float[], status = 'active', updated_at = NOW()
       WHERE id = $3`,
      [persistedImageUrl, toPostgresFloatArray(embeddingResult.embedding), challengeId],
    );

    logger.info(
      "groupChallengeService",
      `Group challenge ${challengeId} is now active`,
      { challengeId },
    );

    // Notify all participants now that the image is ready
    await Promise.all(
      participantIds.map((participantId) =>
        notificationService.addNotification(
          participantId,
          "challenge_received",
          {
            fromUsername: creatorUsername,
            challengeId,
            isGroupChallenge: true,
          },
        ),
      ),
    );
  } catch (err) {
    // Mark challenge as expired so it doesn't sit in pending forever
    await pool
      .query(
        `UPDATE group_challenges SET status = 'expired', updated_at = NOW() WHERE id = $1`,
        [challengeId],
      )
      .catch(() => {
        /* best-effort */
      });

    throw err;
  }
}

// ---------------------------------------------------------------------------
// Service methods
// ---------------------------------------------------------------------------

/**
 * Create a new group challenge.
 *
 * Pipeline:
 *  1. Validate participant count (2-10).
 *  2. Validate all participants are friends of the creator.
 *  3. Validate prompt via content filter.
 *  4. Insert group_challenges row with status 'pending'.
 *  5. Insert participant rows with status 'pending'.
 *  6. Fire-and-forget background image generation + embedding.
 *
 * @param creatorId       - UUID of the user creating the challenge
 * @param participantIds  - UUIDs of the friends to invite (2-10)
 * @param prompt          - The prompt text for image generation
 * @returns The newly created PublicGroupChallenge
 */
async function createGroupChallenge(
  creatorId: string,
  participantIds: string[],
  prompt: string,
): Promise<PublicGroupChallenge> {
  // 1. Validate participant count
  if (participantIds.length < MIN_PARTICIPANTS) {
    throw new Error(
      `[groupChallengeService] Need at least ${MIN_PARTICIPANTS} participants`,
    );
  }

  if (participantIds.length > MAX_PARTICIPANTS) {
    throw new Error(
      `[groupChallengeService] Cannot exceed ${MAX_PARTICIPANTS} participants`,
    );
  }

  // Ensure creator is not in the participant list
  const uniqueParticipants = [...new Set(participantIds)].filter(
    (id) => id !== creatorId,
  );

  if (uniqueParticipants.length < MIN_PARTICIPANTS) {
    throw new Error(
      `[groupChallengeService] Need at least ${MIN_PARTICIPANTS} distinct participants (excluding creator)`,
    );
  }

  // 2. Validate all participants are friends of the creator
  const friendChecks = await Promise.all(
    uniqueParticipants.map(async (participantId) => ({
      participantId,
      isFriend: await friendshipService.areFriends(creatorId, participantId),
    })),
  );

  const nonFriends = friendChecks.filter((c) => !c.isFriend);
  if (nonFriends.length > 0) {
    throw new Error(
      `[groupChallengeService] All participants must be friends of the creator. ` +
        `Non-friends: ${nonFriends.map((c) => c.participantId).join(", ")}`,
    );
  }

  // 3. Content filter
  if (containsBlockedContent(prompt)) {
    throw new Error("[groupChallengeService] Prompt contains blocked content");
  }

  // 4. Insert group challenge with 'pending' status
  const challengeResult = await pool.query<GroupChallengeRow>(
    `INSERT INTO group_challenges (creator_id, prompt, status)
     VALUES ($1, $2, 'pending')
     RETURNING *`,
    [creatorId, prompt],
  );

  const challengeRow = challengeResult.rows[0];

  // 5. Insert participant rows
  const insertValues = uniqueParticipants
    .map((_, i) => `($1, $${i + 2}, 'pending')`)
    .join(", ");

  await pool.query(
    `INSERT INTO group_challenge_participants (group_challenge_id, user_id, status)
     VALUES ${insertValues}`,
    [challengeRow.id, ...uniqueParticipants],
  );

  // Fetch the newly inserted participants with usernames
  const participantsResult = await pool.query<
    GroupChallengeParticipantRow & { username: string }
  >(
    `SELECT gcp.*, u.username
     FROM group_challenge_participants gcp
     JOIN users u ON u.id = gcp.user_id
     WHERE gcp.group_challenge_id = $1
     ORDER BY gcp.created_at ASC`,
    [challengeRow.id],
  );

  const creatorUsername = await getUsernameById(creatorId);

  logger.info(
    "groupChallengeService",
    `Created pending group challenge ${challengeRow.id}`,
    {
      challengeId: challengeRow.id,
      creatorId,
      participantCount: uniqueParticipants.length,
    },
  );

  // 6. Process image generation in the background (fire-and-forget)
  processGroupChallengeBackground(
    challengeRow.id,
    prompt,
    uniqueParticipants,
    creatorUsername,
  ).catch((err) => {
    logger.error(
      "groupChallengeService",
      `Background processing failed for group challenge ${challengeRow.id}`,
      {
        challengeId: challengeRow.id,
        error: err instanceof Error ? err.message : String(err),
      },
    );
  });

  return toPublicGroupChallenge(
    challengeRow,
    creatorUsername,
    participantsResult.rows,
    creatorId,
  );
}

/**
 * Join a group challenge.
 *
 * Transitions a participant's status from 'pending' to 'joined'.
 * Only participants who were invited can join.
 *
 * @param challengeId - UUID of the group challenge
 * @param userId      - UUID of the user joining
 * @returns The updated PublicGroupChallenge
 */
async function joinGroupChallenge(
  challengeId: string,
  userId: string,
): Promise<PublicGroupChallenge> {
  // Verify challenge exists and is active
  const challengeResult = await pool.query<GroupChallengeRow>(
    `SELECT * FROM group_challenges WHERE id = $1`,
    [challengeId],
  );

  if (challengeResult.rows.length === 0) {
    throw new Error(
      `[groupChallengeService] Group challenge not found: ${challengeId}`,
    );
  }

  const challenge = challengeResult.rows[0];

  if (challenge.status !== "active") {
    throw new Error(
      `[groupChallengeService] Cannot join: challenge is '${challenge.status}' (must be 'active')`,
    );
  }

  // Verify user is a participant
  const participantResult = await pool.query<GroupChallengeParticipantRow>(
    `SELECT * FROM group_challenge_participants
     WHERE group_challenge_id = $1 AND user_id = $2`,
    [challengeId, userId],
  );

  if (participantResult.rows.length === 0) {
    throw new Error(
      "[groupChallengeService] You are not a participant in this challenge",
    );
  }

  const participant = participantResult.rows[0];

  if (participant.status !== "pending") {
    throw new Error(
      `[groupChallengeService] Cannot join: your status is '${participant.status}' (must be 'pending')`,
    );
  }

  // Transition to joined
  await pool.query(
    `UPDATE group_challenge_participants
     SET status = 'joined', updated_at = NOW()
     WHERE id = $1`,
    [participant.id],
  );

  logger.info(
    "groupChallengeService",
    `User ${userId} joined group challenge ${challengeId}`,
    { challengeId, userId },
  );

  return getGroupChallenge(challengeId, userId);
}

/**
 * Submit a guess for a group challenge.
 *
 * Computes semantic similarity between the guess and the stored prompt
 * embedding, normalizing to 0-100. Auto-completes the challenge when
 * all participants have resolved (guessed or declined).
 *
 * @param challengeId - UUID of the group challenge
 * @param userId      - UUID of the user submitting the guess
 * @param guessText   - The user's guess text
 * @returns The updated PublicGroupChallenge
 */
async function submitGroupGuess(
  challengeId: string,
  userId: string,
  guessText: string,
): Promise<PublicGroupChallenge> {
  // 1. Get the challenge
  const challengeResult = await pool.query<GroupChallengeRow>(
    `SELECT * FROM group_challenges WHERE id = $1`,
    [challengeId],
  );

  if (challengeResult.rows.length === 0) {
    throw new Error(
      `[groupChallengeService] Group challenge not found: ${challengeId}`,
    );
  }

  const challenge = challengeResult.rows[0];

  // Challenge must be active or scoring
  if (challenge.status !== "active" && challenge.status !== "scoring") {
    throw new Error(
      `[groupChallengeService] Cannot submit guess: challenge is '${challenge.status}' (must be 'active' or 'scoring')`,
    );
  }

  // 2. Verify user is a participant with 'joined' status
  const participantResult = await pool.query<GroupChallengeParticipantRow>(
    `SELECT * FROM group_challenge_participants
     WHERE group_challenge_id = $1 AND user_id = $2`,
    [challengeId, userId],
  );

  if (participantResult.rows.length === 0) {
    throw new Error(
      "[groupChallengeService] You are not a participant in this challenge",
    );
  }

  const participant = participantResult.rows[0];

  if (participant.status !== "joined") {
    throw new Error(
      `[groupChallengeService] Cannot guess: your status is '${participant.status}' (must be 'joined')`,
    );
  }

  // 3. Compute guess embedding
  const embeddingProvider = createEmbeddingProvider(env.EMBEDDING_PROVIDER);
  const guessResult = await embeddingProvider.embed(guessText);
  const guessEmbedding = guessResult.embedding;

  // 4. Compute cosine similarity
  const promptEmbedding = challenge.prompt_embedding;
  if (!promptEmbedding || promptEmbedding.length === 0) {
    throw new Error(
      `[groupChallengeService] Challenge ${challengeId} has no prompt embedding`,
    );
  }

  const rawSimilarity = cosineSimilarity(promptEmbedding, guessEmbedding);

  // 5. Normalize to 0-100
  const score = normalizeScore(rawSimilarity);

  // 6. Update participant: store guess, score, transition to 'guessed'
  await pool.query(
    `UPDATE group_challenge_participants
     SET guess_text = $1, score = $2, status = 'guessed', updated_at = NOW()
     WHERE id = $3`,
    [guessText, score, participant.id],
  );

  // Transition challenge to 'scoring' if still 'active'
  await pool.query(
    `UPDATE group_challenges
     SET status = 'scoring', updated_at = NOW()
     WHERE id = $1 AND status = 'active'`,
    [challengeId],
  );

  logger.info(
    "groupChallengeService",
    `Guess submitted for group challenge ${challengeId} by ${userId}`,
    { challengeId, userId, score, similarity: rawSimilarity },
  );

  // Notify the creator about the guess
  const guessUsername = await getUsernameById(userId);
  await notificationService.addNotification(
    challenge.creator_id,
    "challenge_guessed",
    {
      fromUsername: guessUsername,
      challengeId,
      score,
      isGroupChallenge: true,
    },
  );

  // 7. Check if all participants have resolved => auto-complete
  await maybeCompleteChallenge(challengeId);

  return getGroupChallenge(challengeId, userId);
}

/**
 * Decline a group challenge invitation.
 *
 * Transitions a participant's status to 'declined'.
 * Auto-completes the challenge if all participants have now resolved.
 *
 * @param challengeId - UUID of the group challenge
 * @param userId      - UUID of the user declining
 * @returns The updated PublicGroupChallenge
 */
async function declineGroupChallenge(
  challengeId: string,
  userId: string,
): Promise<PublicGroupChallenge> {
  // Verify challenge exists
  const challengeResult = await pool.query<GroupChallengeRow>(
    `SELECT * FROM group_challenges WHERE id = $1`,
    [challengeId],
  );

  if (challengeResult.rows.length === 0) {
    throw new Error(
      `[groupChallengeService] Group challenge not found: ${challengeId}`,
    );
  }

  const challenge = challengeResult.rows[0];

  if (
    challenge.status !== "active" &&
    challenge.status !== "scoring" &&
    challenge.status !== "pending"
  ) {
    throw new Error(
      `[groupChallengeService] Cannot decline: challenge is '${challenge.status}'`,
    );
  }

  // Verify user is a participant with 'pending' or 'joined' status
  const participantResult = await pool.query<GroupChallengeParticipantRow>(
    `SELECT * FROM group_challenge_participants
     WHERE group_challenge_id = $1 AND user_id = $2`,
    [challengeId, userId],
  );

  if (participantResult.rows.length === 0) {
    throw new Error(
      "[groupChallengeService] You are not a participant in this challenge",
    );
  }

  const participant = participantResult.rows[0];

  if (participant.status !== "pending" && participant.status !== "joined") {
    throw new Error(
      `[groupChallengeService] Cannot decline: your status is '${participant.status}'`,
    );
  }

  // Transition to declined
  await pool.query(
    `UPDATE group_challenge_participants
     SET status = 'declined', updated_at = NOW()
     WHERE id = $1`,
    [participant.id],
  );

  logger.info(
    "groupChallengeService",
    `User ${userId} declined group challenge ${challengeId}`,
    { challengeId, userId },
  );

  // Check if all participants have resolved => auto-complete
  await maybeCompleteChallenge(challengeId);

  return getGroupChallenge(challengeId, userId);
}

/**
 * Get a group challenge by its ID.
 *
 * The prompt is hidden from participants until they have guessed.
 * Only the creator and participants can view the challenge.
 *
 * @param challengeId  - UUID of the group challenge
 * @param viewerUserId - UUID of the user viewing the challenge
 * @returns The PublicGroupChallenge, or null if not found
 */
async function getGroupChallenge(
  challengeId: string,
  viewerUserId: string,
): Promise<PublicGroupChallenge> {
  const challengeResult = await pool.query<GroupChallengeRow>(
    `SELECT * FROM group_challenges WHERE id = $1`,
    [challengeId],
  );

  if (challengeResult.rows.length === 0) {
    throw new Error(
      `[groupChallengeService] Group challenge not found: ${challengeId}`,
    );
  }

  const challenge = challengeResult.rows[0];

  // Load participants with usernames
  const participantsResult = await pool.query<
    GroupChallengeParticipantRow & { username: string }
  >(
    `SELECT gcp.*, u.username
     FROM group_challenge_participants gcp
     JOIN users u ON u.id = gcp.user_id
     WHERE gcp.group_challenge_id = $1
     ORDER BY gcp.score DESC NULLS LAST, gcp.created_at ASC`,
    [challengeId],
  );

  // Only creator and participants can view
  const isCreator = challenge.creator_id === viewerUserId;
  const isParticipant = participantsResult.rows.some(
    (p) => p.user_id === viewerUserId,
  );

  if (!isCreator && !isParticipant) {
    throw new Error(
      "[groupChallengeService] You are not a participant in this challenge",
    );
  }

  const creatorUsername = await getUsernameById(challenge.creator_id);

  return toPublicGroupChallenge(
    challenge,
    creatorUsername,
    participantsResult.rows,
    viewerUserId,
  );
}

/**
 * Get all group challenges for a user (as creator or participant).
 *
 * Returns challenges ordered by most recently updated first.
 *
 * @param userId - UUID of the user
 * @returns Array of PublicGroupChallenge
 */
async function getUserGroupChallenges(
  userId: string,
): Promise<PublicGroupChallenge[]> {
  // Find all group challenge IDs where user is creator or participant
  const challengeIdsResult = await pool.query<{ id: string }>(
    `SELECT DISTINCT gc.id
     FROM group_challenges gc
     LEFT JOIN group_challenge_participants gcp ON gcp.group_challenge_id = gc.id
     WHERE gc.creator_id = $1 OR gcp.user_id = $1
     ORDER BY gc.id DESC`,
    [userId],
  );

  if (challengeIdsResult.rows.length === 0) {
    return [];
  }

  const challengeIds = challengeIdsResult.rows.map((r) => r.id);

  // Fetch all challenge rows
  const challengesResult = await pool.query<GroupChallengeRow>(
    `SELECT * FROM group_challenges
     WHERE id = ANY($1)
     ORDER BY updated_at DESC`,
    [challengeIds],
  );

  // Fetch all participants for these challenges in one query
  const participantsResult = await pool.query<
    GroupChallengeParticipantRow & { username: string }
  >(
    `SELECT gcp.*, u.username
     FROM group_challenge_participants gcp
     JOIN users u ON u.id = gcp.user_id
     WHERE gcp.group_challenge_id = ANY($1)
     ORDER BY gcp.score DESC NULLS LAST, gcp.created_at ASC`,
    [challengeIds],
  );

  // Group participants by challenge ID
  const participantsByChallenge = new Map<
    string,
    Array<GroupChallengeParticipantRow & { username: string }>
  >();

  for (const p of participantsResult.rows) {
    const existing = participantsByChallenge.get(p.group_challenge_id) ?? [];
    existing.push(p);
    participantsByChallenge.set(p.group_challenge_id, existing);
  }

  // Look up creator usernames
  const creatorIds = [
    ...new Set(challengesResult.rows.map((c) => c.creator_id)),
  ];
  const creatorUsernamesResult = await pool.query<{
    id: string;
    username: string;
  }>(
    `SELECT id, username FROM users WHERE id = ANY($1)`,
    [creatorIds],
  );

  const creatorUsernameMap = new Map<string, string>();
  for (const row of creatorUsernamesResult.rows) {
    creatorUsernameMap.set(row.id, row.username);
  }

  // Build public challenges
  return challengesResult.rows.map((challenge) =>
    toPublicGroupChallenge(
      challenge,
      creatorUsernameMap.get(challenge.creator_id) ?? "Unknown",
      participantsByChallenge.get(challenge.id) ?? [],
      userId,
    ),
  );
}

/**
 * Expire group challenges that have been active for more than the expiry threshold.
 *
 * Batch-updates all active/scoring challenges older than the expiry threshold.
 * Intended to be called periodically by the scheduler.
 *
 * @returns The number of challenges expired
 */
async function expireGroupChallenges(): Promise<number> {
  const result = await pool.query(
    `UPDATE group_challenges
     SET status = 'expired', updated_at = NOW()
     WHERE status IN ('active', 'scoring', 'pending')
       AND created_at < NOW() - INTERVAL '${GROUP_CHALLENGE_EXPIRY_DAYS} days'`,
  );

  const count = result.rowCount ?? 0;

  if (count > 0) {
    logger.info(
      "groupChallengeService",
      `Expired ${count} group challenges`,
      { count },
    );
  }

  return count;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const groupChallengeService = {
  createGroupChallenge,
  joinGroupChallenge,
  submitGroupGuess,
  declineGroupChallenge,
  getGroupChallenge,
  getUserGroupChallenges,
  expireGroupChallenges,
};
