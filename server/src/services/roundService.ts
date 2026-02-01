/**
 * Round service.
 *
 * Orchestrates the full lifecycle of game rounds — creation, activation,
 * completion, and querying. The createRound pipeline ties together the word
 * bank, image generation, and embedding services to produce a complete round.
 *
 * Key design decisions:
 * - createRound uses a database transaction to keep round, round_words, and
 *   word-usage updates atomic.
 * - Only one round can be active at a time; activateRound enforces this.
 * - Embeddings are stored as FLOAT[] in PostgreSQL.
 */

import { pool } from "../config/database";
import { env } from "../config/env";
import type { RoundRow, Round } from "../models/round";
import { toRound } from "../models/round";
import { wordBankService } from "./wordBankService";
import { createImageProvider } from "./imageGeneration";
import { createEmbeddingProvider } from "./embedding";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Convert a number[] embedding to a PostgreSQL FLOAT[] literal string.
 * PostgreSQL expects the format: {1.0,2.0,3.0}
 */
function toPostgresFloatArray(embedding: number[]): string {
  return `{${embedding.join(",")}}`;
}

// ---------------------------------------------------------------------------
// Service methods
// ---------------------------------------------------------------------------

/**
 * Full round creation pipeline.
 *
 * 1. Select random words from word bank
 * 2. Assemble prompt from the selected words
 * 3. Generate image from the prompt
 * 4. Compute prompt embedding
 * 5. Insert round into DB (with prompt, image_url, prompt_embedding)
 * 6. Insert word associations into round_words junction table
 * 7. Mark words as used in the word bank
 *
 * All database operations are wrapped in a transaction.
 *
 * @returns The newly created Round
 * @throws Error if any step in the pipeline fails
 */
async function createRound(): Promise<Round> {
  // Step 1: Select random words
  const wordEntries = await wordBankService.getRandomWords(5);
  if (wordEntries.length === 0) {
    throw new Error(
      "[roundService] Cannot create round: no words available in word bank"
    );
  }

  // Step 2: Assemble prompt from word entries (category-aware)
  const prompt = wordBankService.assemblePromptFromEntries(wordEntries);

  // Step 3: Generate image
  const imageProvider = createImageProvider(env.IMAGE_PROVIDER);
  const imageResult = await imageProvider.generate(prompt);

  // Step 4: Compute prompt embedding
  const embeddingProvider = createEmbeddingProvider(env.EMBEDDING_PROVIDER);
  const embeddingResult = await embeddingProvider.embed(prompt);

  // Step 5–7: Database operations in a transaction
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Insert round
    const insertRoundQuery = `
      INSERT INTO rounds (prompt, image_url, status, prompt_embedding)
      VALUES ($1, $2, 'pending', $3::float[])
      RETURNING *
    `;
    const roundResult = await client.query<RoundRow>(insertRoundQuery, [
      prompt,
      imageResult.imageUrl,
      toPostgresFloatArray(embeddingResult.embedding),
    ]);
    const roundRow = roundResult.rows[0];

    // Insert round_words junction entries
    if (wordEntries.length > 0) {
      const wordValues = wordEntries
        .map((_, i) => `($1, $${i + 2})`)
        .join(", ");
      const wordParams: (string | number)[] = [roundRow.id];
      for (const entry of wordEntries) {
        wordParams.push(entry.id);
      }

      await client.query(
        `INSERT INTO round_words (round_id, word_id) VALUES ${wordValues}`,
        wordParams
      );
    }

    // Mark words as used
    const wordIds = wordEntries.map((e) => e.id);
    await client.query(
      `UPDATE word_bank SET last_used_at = NOW() WHERE id = ANY($1)`,
      [wordIds]
    );

    await client.query("COMMIT");

    console.log(
      `[roundService] Created round ${roundRow.id} with prompt: "${prompt}"`
    );
    return toRound(roundRow);
  } catch (err) {
    await client.query("ROLLBACK");
    const message = err instanceof Error ? err.message : String(err);
    console.error("[roundService] createRound transaction failed:", message);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Activate a round, setting its status to 'active' and recording started_at.
 *
 * @param roundId - UUID of the round to activate
 * @returns The activated Round
 * @throws Error if the round doesn't exist or is not in 'pending' status
 */
async function activateRound(roundId: string): Promise<Round> {
  const result = await pool.query<RoundRow>(
    `UPDATE rounds
     SET status = 'active', started_at = NOW()
     WHERE id = $1 AND status = 'pending'
     RETURNING *`,
    [roundId]
  );

  if (result.rows.length === 0) {
    // Check if round exists at all
    const existsResult = await pool.query(
      `SELECT id, status FROM rounds WHERE id = $1`,
      [roundId]
    );

    if (existsResult.rows.length === 0) {
      throw new Error(`[roundService] Round not found: ${roundId}`);
    }

    throw new Error(
      `[roundService] Cannot activate round ${roundId}: ` +
        `current status is '${existsResult.rows[0].status}' (must be 'pending')`
    );
  }

  console.log(`[roundService] Activated round ${roundId}`);
  return toRound(result.rows[0]);
}

/**
 * Complete a round, setting its status to 'completed' and recording ended_at.
 *
 * @param roundId - UUID of the round to complete
 * @returns The completed Round
 * @throws Error if the round doesn't exist or is not in 'active' status
 */
async function completeRound(roundId: string): Promise<Round> {
  const result = await pool.query<RoundRow>(
    `UPDATE rounds
     SET status = 'completed', ended_at = NOW()
     WHERE id = $1 AND status = 'active'
     RETURNING *`,
    [roundId]
  );

  if (result.rows.length === 0) {
    const existsResult = await pool.query(
      `SELECT id, status FROM rounds WHERE id = $1`,
      [roundId]
    );

    if (existsResult.rows.length === 0) {
      throw new Error(`[roundService] Round not found: ${roundId}`);
    }

    throw new Error(
      `[roundService] Cannot complete round ${roundId}: ` +
        `current status is '${existsResult.rows[0].status}' (must be 'active')`
    );
  }

  console.log(`[roundService] Completed round ${roundId}`);
  return toRound(result.rows[0]);
}

/**
 * Get the currently active round (at most one should exist).
 *
 * @returns The active Round, or null if no round is active
 */
async function getActiveRound(): Promise<Round | null> {
  const result = await pool.query<RoundRow>(
    `SELECT * FROM rounds WHERE status = 'active' LIMIT 1`
  );

  if (result.rows.length === 0) {
    return null;
  }

  return toRound(result.rows[0]);
}

/**
 * Get a round by its ID.
 *
 * @param roundId - UUID of the round to retrieve
 * @returns The Round, or null if not found
 */
async function getRoundById(roundId: string): Promise<Round | null> {
  const result = await pool.query<RoundRow>(
    `SELECT * FROM rounds WHERE id = $1`,
    [roundId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return toRound(result.rows[0]);
}

/**
 * Get recent completed rounds, ordered by ended_at descending.
 *
 * @param limit - Maximum number of rounds to return (default: 10)
 * @returns Array of completed Rounds
 */
async function getRecentRounds(limit: number = 10): Promise<Round[]> {
  const result = await pool.query<RoundRow>(
    `SELECT * FROM rounds
     WHERE status = 'completed'
     ORDER BY ended_at DESC
     LIMIT $1`,
    [limit]
  );

  return result.rows.map(toRound);
}

/**
 * Convenience method: create a new round and immediately activate it.
 *
 * If there is currently an active round, it will be completed first to
 * ensure only one round is active at a time.
 *
 * @returns The newly created and activated Round
 */
async function createAndActivateRound(): Promise<Round> {
  // Complete the currently active round if one exists
  const currentActive = await getActiveRound();
  if (currentActive) {
    console.log(
      `[roundService] Completing currently active round ${currentActive.id} before creating new one`
    );
    await completeRound(currentActive.id);
  }

  // Create a new round
  const newRound = await createRound();

  // Activate the new round
  const activatedRound = await activateRound(newRound.id);

  return activatedRound;
}

export const roundService = {
  createRound,
  activateRound,
  completeRound,
  getActiveRound,
  getRoundById,
  getRecentRounds,
  createAndActivateRound,
};
