/**
 * Embedding service module.
 *
 * Provides a factory for creating embedding providers based on configuration,
 * plus utility functions for working with embeddings.
 *
 * Usage:
 *   import { getEmbeddingProvider, cosineSimilarity } from '../services/embedding';
 *
 *   const provider = getEmbeddingProvider();
 *   const result = await provider.embed("hello world");
 *   const similarity = cosineSimilarity(vectorA, vectorB);
 */

import { env } from "../../config/env";
import { MockEmbeddingProvider } from "./mockProvider";
import type { EmbeddingProvider } from "./types";

// Re-export types and utilities
export type { EmbeddingProvider, EmbeddingResult } from "./types";
export { cosineSimilarity } from "./similarity";
export { MockEmbeddingProvider } from "./mockProvider";

/**
 * Create an embedding provider by name.
 *
 * @param providerName - The provider to create ("mock" or "openai")
 * @returns An EmbeddingProvider instance
 * @throws Error if the provider name is not recognized
 */
export function createEmbeddingProvider(
  providerName: string
): EmbeddingProvider {
  switch (providerName.toLowerCase()) {
    case "mock":
      return new MockEmbeddingProvider();

    case "openai":
      // OpenAI provider will be implemented in Task 1.5
      throw new Error(
        'OpenAI embedding provider is not yet implemented. Set EMBEDDING_PROVIDER=mock or implement the OpenAI provider.'
      );

    default:
      throw new Error(
        `Unknown embedding provider: "${providerName}". Supported providers: mock, openai`
      );
  }
}

/**
 * Get the embedding provider based on environment configuration.
 *
 * Reads the EMBEDDING_PROVIDER env var (defaults to "mock").
 *
 * @returns An EmbeddingProvider instance configured for the current environment
 */
export function getEmbeddingProvider(): EmbeddingProvider {
  const providerName = env.EMBEDDING_PROVIDER;
  return createEmbeddingProvider(providerName);
}
