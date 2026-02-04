/**
 * Hybrid scoring service with element-level breakdown.
 *
 * Augments the existing cosine-similarity score with a granular element
 * breakdown that shows which individual words from the prompt were matched
 * (exact or partial/semantic) in the player's guess.
 *
 * Scoring pipeline:
 *   1. Tokenize both prompt and guess into meaningful words (lowercase,
 *      punctuation stripped, stop words removed).
 *   2. Find exact word matches between prompt and guess tokens.
 *   3. For remaining unmatched prompt words, compute word-level embedding
 *      similarity against each unmatched guess word. If any pair exceeds the
 *      PARTIAL_MATCH_THRESHOLD (0.7), record it as a partial/semantic match.
 *   4. Compute an element score: (exactMatches + 0.5 * partialMatches) /
 *      totalPromptWords, scaled to 0-100.
 *
 * The element breakdown is supplementary feedback and does NOT replace the
 * existing cosine-similarity-based overall score.
 */

import { env } from "../config/env";
import { logger } from "../config/logger";
import type { ElementScoreBreakdown } from "../models/guess";
import { createEmbeddingProvider, cosineSimilarity } from "./embedding";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Minimum cosine similarity between two word embeddings to consider them
 * a partial/semantic match.
 */
const PARTIAL_MATCH_THRESHOLD = 0.6;

/**
 * Common English stop words to exclude from tokenization.
 * These carry little semantic meaning for prompt matching.
 */
const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "in",
  "of",
  "and",
  "with",
  "on",
  "at",
  "to",
  "for",
  "is",
  "it",
  "by",
  "as",
  "or",
  "be",
  "was",
  "are",
  "from",
  "that",
  "this",
  "but",
  "not",
  "has",
  "have",
  "had",
  "its",
]);

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Tokenize a text string into meaningful words.
 *
 * Steps:
 *   1. Convert to lowercase
 *   2. Strip punctuation (keep only letters, numbers, and spaces)
 *   3. Split on whitespace
 *   4. Remove stop words
 *   5. Remove empty tokens
 *
 * @param text - Raw text to tokenize
 * @returns Array of cleaned, meaningful word tokens
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((word) => word.length > 0 && !STOP_WORDS.has(word));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute an element-level breakdown comparing a prompt to a guess.
 *
 * Identifies exact and partial word-level matches between the prompt and
 * guess texts. The element score reflects how many prompt words the player
 * captured, weighted by match quality.
 *
 * @param promptText - The original prompt used to generate the AI image
 * @param guessText - The player's guess text
 * @param overallScore - The cosine-similarity-based 0-100 score
 * @returns ElementScoreBreakdown with matched words, partial matches, and scores
 */
async function computeElementBreakdown(
  promptText: string,
  guessText: string,
  overallScore: number
): Promise<ElementScoreBreakdown> {
  const promptTokens = tokenize(promptText);
  const guessTokens = tokenize(guessText);

  // Edge case: if the prompt has no meaningful words after tokenization
  if (promptTokens.length === 0) {
    return {
      matchedWords: [],
      partialMatches: [],
      elementScore: 0,
      overallScore,
    };
  }

  // Deduplicate prompt tokens — repeated words should only need to be
  // matched once, not penalise the player for having fewer copies.
  const uniquePromptTokens = [...new Set(promptTokens)];

  // Step 1: Find exact matches
  const matchedWords: string[] = [];
  const unmatchedPromptWords: string[] = [];
  const remainingGuessWords = new Set(guessTokens);

  for (const promptWord of uniquePromptTokens) {
    if (remainingGuessWords.has(promptWord)) {
      matchedWords.push(promptWord);
      remainingGuessWords.delete(promptWord);
    } else {
      unmatchedPromptWords.push(promptWord);
    }
  }

  // Step 2: Find partial/semantic matches for remaining words
  const partialMatches: { word: string; similarity: number }[] = [];

  if (unmatchedPromptWords.length > 0 && remainingGuessWords.size > 0) {
    const embeddingProvider = createEmbeddingProvider(env.EMBEDDING_PROVIDER);
    const remainingGuessArray = Array.from(remainingGuessWords);

    // Embed all unmatched words (prompt + guess)
    const allWords = [...unmatchedPromptWords, ...remainingGuessArray];

    let embeddings: number[][];

    if (embeddingProvider.embedBatch) {
      const results = await embeddingProvider.embedBatch(allWords);
      embeddings = results.map((r) => r.embedding);
    } else {
      // Fallback to sequential embedding
      const results = await Promise.all(
        allWords.map((word) => embeddingProvider.embed(word))
      );
      embeddings = results.map((r) => r.embedding);
    }

    // Split embeddings back into prompt and guess groups
    const promptEmbeddings = embeddings.slice(0, unmatchedPromptWords.length);
    const guessEmbeddings = embeddings.slice(unmatchedPromptWords.length);

    // Track which guess words have already been used for a partial match
    const usedGuessIndices = new Set<number>();

    for (let pi = 0; pi < unmatchedPromptWords.length; pi++) {
      let bestSimilarity = 0;
      let bestGuessIdx = -1;

      for (let gi = 0; gi < remainingGuessArray.length; gi++) {
        if (usedGuessIndices.has(gi)) continue;

        const similarity = cosineSimilarity(
          promptEmbeddings[pi],
          guessEmbeddings[gi]
        );

        if (similarity > bestSimilarity) {
          bestSimilarity = similarity;
          bestGuessIdx = gi;
        }
      }

      if (bestSimilarity >= PARTIAL_MATCH_THRESHOLD && bestGuessIdx >= 0) {
        partialMatches.push({
          word: unmatchedPromptWords[pi],
          similarity: Math.round(bestSimilarity * 1000) / 1000,
        });
        usedGuessIndices.add(bestGuessIdx);
      }
    }
  }

  // Step 3: Compute element score
  const totalPromptWords = uniquePromptTokens.length;
  const rawElementScore =
    (matchedWords.length + 0.5 * partialMatches.length) / totalPromptWords;
  const elementScore = Math.round(Math.min(1, rawElementScore) * 100);

  logger.debug("hybridScoringService", "Element breakdown computed", {
    promptTokens,
    guessTokens,
    matchedWords,
    partialMatches,
    elementScore,
  });

  return {
    matchedWords,
    partialMatches,
    elementScore,
    overallScore,
  };
}

export const hybridScoringService = {
  computeElementBreakdown,
  tokenize,
};
