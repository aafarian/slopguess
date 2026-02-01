/**
 * Prompt variety service.
 *
 * Provides anti-repetition validation for word combinations used in round prompts.
 * Queries the round_words junction table to check that proposed word sets do not
 * overlap excessively with recently used combinations. NFR-002 requires no word
 * combination repeated within 30 rounds.
 *
 * Key features:
 * - validateCombination(): checks if a proposed set of word IDs is sufficiently
 *   different from the last N rounds' word sets.
 * - getVarietyReport(): returns overlap statistics for the last N rounds.
 */

import { pool } from "../config/database";
import { logger } from "../config/logger";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** How many recent rounds to check against for repetition. */
const LOOKBACK_ROUNDS = 30;

/**
 * Maximum allowed overlap ratio between a proposed combination and any
 * single recent round. An overlap ratio of 0.5 means half the words
 * match -- we reject at this threshold or above to keep prompts fresh.
 */
const MAX_OVERLAP_RATIO = 0.5;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ValidationResult {
  /** Whether the proposed combination passes the variety check. */
  valid: boolean;
  /** The highest overlap ratio found against any recent round. */
  highestOverlapRatio: number;
  /** Round ID that had the most overlap (null if no overlap). */
  mostOverlappingRoundId: string | null;
  /** Number of overlapping word IDs with that round. */
  overlappingWordCount: number;
  /** The threshold used for validation. */
  threshold: number;
}

export interface RoundOverlapEntry {
  roundId: string;
  prompt: string;
  createdAt: Date;
  wordIds: number[];
  overlapWithPrevious: number;
}

export interface VarietyReport {
  /** Number of recent rounds analyzed. */
  roundsAnalyzed: number;
  /** Lookback window size. */
  lookbackWindow: number;
  /** Average pairwise overlap between consecutive rounds. */
  averageOverlap: number;
  /** Maximum pairwise overlap found. */
  maxOverlap: number;
  /** Per-round breakdown. */
  rounds: RoundOverlapEntry[];
}

// ---------------------------------------------------------------------------
// Service methods
// ---------------------------------------------------------------------------

/**
 * Validate whether a proposed word combination is sufficiently different from
 * recent rounds.
 *
 * Queries the round_words junction table for the most recent N rounds and
 * computes the overlap ratio (|intersection| / |proposed|) against each.
 * If any ratio exceeds MAX_OVERLAP_RATIO, the combination is rejected.
 *
 * @param proposedWordIds Array of word_bank IDs in the proposed combination
 * @param lookback Number of recent rounds to check (default: LOOKBACK_ROUNDS)
 * @returns ValidationResult indicating pass/fail and overlap details
 */
async function validateCombination(
  proposedWordIds: number[],
  lookback: number = LOOKBACK_ROUNDS
): Promise<ValidationResult> {
  if (proposedWordIds.length === 0) {
    return {
      valid: true,
      highestOverlapRatio: 0,
      mostOverlappingRoundId: null,
      overlappingWordCount: 0,
      threshold: MAX_OVERLAP_RATIO,
    };
  }

  try {
    // Get word IDs used in the most recent N rounds, grouped by round
    const recentRoundsQuery = `
      SELECT rw.round_id, ARRAY_AGG(rw.word_id) AS word_ids
      FROM round_words rw
      INNER JOIN rounds r ON r.id = rw.round_id
      WHERE r.created_at >= (
        SELECT COALESCE(MIN(created_at), NOW())
        FROM (
          SELECT DISTINCT created_at
          FROM rounds
          ORDER BY created_at DESC
          LIMIT $1
        ) recent
      )
      GROUP BY rw.round_id
    `;

    const result = await pool.query<{
      round_id: string;
      word_ids: number[];
    }>(recentRoundsQuery, [lookback]);

    let highestOverlapRatio = 0;
    let mostOverlappingRoundId: string | null = null;
    let overlappingWordCount = 0;

    const proposedSet = new Set(proposedWordIds);

    for (const row of result.rows) {
      const recentWordIds = row.word_ids;
      const intersection = recentWordIds.filter((id) => proposedSet.has(id));
      const overlapRatio = intersection.length / proposedWordIds.length;

      if (overlapRatio > highestOverlapRatio) {
        highestOverlapRatio = overlapRatio;
        mostOverlappingRoundId = row.round_id;
        overlappingWordCount = intersection.length;
      }
    }

    return {
      valid: highestOverlapRatio < MAX_OVERLAP_RATIO,
      highestOverlapRatio,
      mostOverlappingRoundId,
      overlappingWordCount,
      threshold: MAX_OVERLAP_RATIO,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("promptVarietyService", "validateCombination failed", { error: message });
    // On error, allow the combination through so we don't block round creation
    return {
      valid: true,
      highestOverlapRatio: 0,
      mostOverlappingRoundId: null,
      overlappingWordCount: 0,
      threshold: MAX_OVERLAP_RATIO,
    };
  }
}

/**
 * Generate a variety report showing overlap statistics for the last N rounds.
 *
 * For each recent round, shows the word IDs used and how many overlapped
 * with the previous round. Also computes aggregate stats.
 *
 * @param lookback Number of recent rounds to include (default: LOOKBACK_ROUNDS)
 * @returns VarietyReport with per-round breakdown and aggregate stats
 */
async function getVarietyReport(
  lookback: number = LOOKBACK_ROUNDS
): Promise<VarietyReport> {
  try {
    const query = `
      SELECT r.id AS round_id, r.prompt, r.created_at,
             ARRAY_AGG(rw.word_id ORDER BY rw.word_id) AS word_ids
      FROM rounds r
      INNER JOIN round_words rw ON rw.round_id = r.id
      GROUP BY r.id, r.prompt, r.created_at
      ORDER BY r.created_at DESC
      LIMIT $1
    `;

    const result = await pool.query<{
      round_id: string;
      prompt: string;
      created_at: Date;
      word_ids: number[];
    }>(query, [lookback]);

    const rounds: RoundOverlapEntry[] = [];
    let totalOverlap = 0;
    let maxOverlap = 0;
    let pairCount = 0;

    // Rounds are ordered newest-first; iterate to compute consecutive overlaps
    for (let i = 0; i < result.rows.length; i++) {
      const row = result.rows[i];
      let overlapWithPrevious = 0;

      if (i < result.rows.length - 1) {
        // Compare with the next row (which is the chronologically previous round)
        const previousWordSet = new Set(result.rows[i + 1].word_ids);
        overlapWithPrevious = row.word_ids.filter((id) =>
          previousWordSet.has(id)
        ).length;
        totalOverlap += overlapWithPrevious;
        if (overlapWithPrevious > maxOverlap) {
          maxOverlap = overlapWithPrevious;
        }
        pairCount++;
      }

      rounds.push({
        roundId: row.round_id,
        prompt: row.prompt,
        createdAt: row.created_at,
        wordIds: row.word_ids,
        overlapWithPrevious,
      });
    }

    return {
      roundsAnalyzed: result.rows.length,
      lookbackWindow: lookback,
      averageOverlap: pairCount > 0 ? totalOverlap / pairCount : 0,
      maxOverlap,
      rounds,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("promptVarietyService", "getVarietyReport failed", { error: message });
    return {
      roundsAnalyzed: 0,
      lookbackWindow: lookback,
      averageOverlap: 0,
      maxOverlap: 0,
      rounds: [],
    };
  }
}

export const promptVarietyService = {
  validateCombination,
  getVarietyReport,
  LOOKBACK_ROUNDS,
  MAX_OVERLAP_RATIO,
};
