/**
 * Mock embedding provider for development and testing.
 *
 * Generates deterministic pseudo-random embedding vectors based on input text.
 * The same input text always produces the same vector. Different texts produce
 * different vectors. Semantically similar texts (sharing words) produce vectors
 * with higher cosine similarity due to the word-hashing approach.
 *
 * Approach:
 * 1. Normalize and tokenize the input text into words
 * 2. For each word, hash it to produce deterministic contributions
 *    across specific vector dimensions
 * 3. Accumulate word contributions into a sparse-ish vector
 * 4. Normalize the final vector to unit length
 *
 * This ensures:
 * - Determinism: same text -> same vector
 * - Differentiation: different texts -> different vectors
 * - Similarity: texts sharing words -> higher cosine similarity
 */

import { EmbeddingProvider, EmbeddingResult } from "./types";

/** Fixed dimension for mock embedding vectors */
const MOCK_DIMENSIONS = 128;

/** Provider name constant */
const PROVIDER_NAME = "mock";

/**
 * Simple deterministic hash function for strings.
 * Produces a 32-bit unsigned integer from a string input.
 * Uses FNV-1a variant for good distribution.
 */
function hashString(str: string): number {
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193); // FNV prime
    hash = hash >>> 0; // Convert to unsigned 32-bit
  }
  return hash;
}

/**
 * Simple seeded PRNG (xorshift32) for deterministic pseudo-random numbers.
 * Returns a function that produces the next pseudo-random number (0 to 1) on each call.
 */
function createSeededRNG(seed: number): () => number {
  let state = seed === 0 ? 1 : seed; // Avoid zero state
  return () => {
    state ^= state << 13;
    state ^= state >> 17;
    state ^= state << 5;
    state = state >>> 0; // Unsigned 32-bit
    return state / 0xffffffff;
  };
}

/**
 * Normalize input text: lowercase, trim, collapse whitespace.
 */
function normalizeText(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * Tokenize text into words, removing punctuation.
 */
function tokenize(text: string): string[] {
  return normalizeText(text)
    .replace(/[^a-z0-9\s]/g, "")
    .split(" ")
    .filter((w) => w.length > 0);
}

/**
 * Generate a deterministic embedding vector for the given text.
 *
 * Uses a two-pronged approach for realistic similarity behavior:
 * 1. Word-level contributions: each word hashes into specific dimensions,
 *    so texts sharing words have overlapping vector components.
 * 2. Full-text hash seed: adds a text-level signature so even texts with
 *    the same bag of words in different order get slight differentiation.
 */
function generateEmbedding(text: string): number[] {
  const vector = new Float64Array(MOCK_DIMENSIONS);
  const words = tokenize(text);

  if (words.length === 0) {
    // For empty/whitespace-only text, generate a vector from the raw text hash
    const seed = hashString(text || "empty");
    const rng = createSeededRNG(seed);
    for (let i = 0; i < MOCK_DIMENSIONS; i++) {
      vector[i] = rng() * 2 - 1; // Range [-1, 1]
    }
  } else {
    // Step 1: Accumulate word-level contributions
    for (const word of words) {
      const wordHash = hashString(word);
      const rng = createSeededRNG(wordHash);

      // Each word contributes to multiple dimensions
      const numContributions = 16;
      for (let c = 0; c < numContributions; c++) {
        const dim = Math.floor(rng() * MOCK_DIMENSIONS);
        const value = rng() * 2 - 1; // Range [-1, 1]
        vector[dim] += value;
      }
    }

    // Step 2: Add a small text-order-dependent component
    // This differentiates "cat dog" from "dog cat"
    const fullTextHash = hashString(normalizeText(text));
    const orderRng = createSeededRNG(fullTextHash);
    const orderWeight = 0.1; // Small weight so word overlap still dominates similarity
    for (let i = 0; i < MOCK_DIMENSIONS; i++) {
      vector[i] += orderWeight * (orderRng() * 2 - 1);
    }
  }

  // Step 3: Normalize to unit length
  let magnitude = 0;
  for (let i = 0; i < MOCK_DIMENSIONS; i++) {
    magnitude += vector[i] * vector[i];
  }
  magnitude = Math.sqrt(magnitude);

  const result: number[] = new Array(MOCK_DIMENSIONS);
  if (magnitude === 0) {
    // Degenerate case: return a small random vector
    const fallbackRng = createSeededRNG(hashString("fallback_" + text));
    let fallbackMag = 0;
    for (let i = 0; i < MOCK_DIMENSIONS; i++) {
      result[i] = fallbackRng() * 2 - 1;
      fallbackMag += result[i] * result[i];
    }
    fallbackMag = Math.sqrt(fallbackMag);
    for (let i = 0; i < MOCK_DIMENSIONS; i++) {
      result[i] /= fallbackMag;
    }
  } else {
    for (let i = 0; i < MOCK_DIMENSIONS; i++) {
      result[i] = vector[i] / magnitude;
    }
  }

  return result;
}

/**
 * Mock embedding provider that generates deterministic pseudo-random vectors.
 *
 * Suitable for development and testing. Produces consistent vectors for the
 * same input, with basic word-overlap-based similarity behavior.
 */
export class MockEmbeddingProvider implements EmbeddingProvider {
  readonly name = PROVIDER_NAME;

  async embed(text: string): Promise<EmbeddingResult> {
    const embedding = generateEmbedding(text);

    return {
      embedding,
      provider: PROVIDER_NAME,
      model: "mock-hash-v1",
      dimensions: MOCK_DIMENSIONS,
    };
  }

  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    return Promise.all(texts.map((text) => this.embed(text)));
  }
}
