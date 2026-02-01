/**
 * Provider-agnostic embedding service interface.
 *
 * Per TR-003, scoring uses embedding-based cosine similarity with an
 * adapter/strategy pattern so that the underlying provider (OpenAI, mock, etc.)
 * can be swapped via configuration without changing consuming code.
 */

export interface EmbeddingProvider {
  /** Human-readable name of this provider (e.g. "mock", "openai") */
  name: string;

  /**
   * Generate an embedding vector for a text input.
   *
   * @param text - Input text to embed
   * @returns The embedding result with vector and metadata
   */
  embed(text: string): Promise<EmbeddingResult>;

  /**
   * Optional batch embedding for multiple texts.
   * Falls back to sequential embed() calls if not implemented.
   *
   * @param texts - Array of input texts to embed
   * @returns Array of embedding results
   */
  embedBatch?(texts: string[]): Promise<EmbeddingResult[]>;
}

export interface EmbeddingResult {
  /** The embedding vector (array of floats) */
  embedding: number[];
  /** Name of the provider that produced this embedding */
  provider: string;
  /** Model used to produce the embedding (if applicable) */
  model?: string;
  /** Number of dimensions in the embedding vector */
  dimensions: number;
}
