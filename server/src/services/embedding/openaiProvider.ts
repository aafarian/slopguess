/**
 * OpenAI embedding provider using the text-embedding-3-small model.
 *
 * Calls the OpenAI Embeddings API directly via fetch (no SDK dependency).
 * Produces 1536-dimensional normalized vectors suitable for cosine similarity.
 *
 * Configuration:
 *   - Requires OPENAI_API_KEY in env config
 *   - Selected when EMBEDDING_PROVIDER=openai
 */

import { env } from "../../config/env";
import { EmbeddingProvider, EmbeddingResult } from "./types";

/** OpenAI embeddings API endpoint */
const OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings";

/** Model to use for embeddings */
const MODEL = "text-embedding-3-small";

/** Number of dimensions produced by text-embedding-3-small */
const DIMENSIONS = 1536;

/** Provider name constant */
const PROVIDER_NAME = "openai";

/** Maximum texts per batch request (OpenAI limit is 2048) */
const MAX_BATCH_SIZE = 2048;

/**
 * Shape of the OpenAI embeddings API response.
 */
interface OpenAIEmbeddingResponse {
  object: string;
  data: Array<{
    object: string;
    index: number;
    embedding: number[];
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

/**
 * Shape of an OpenAI API error response.
 */
interface OpenAIErrorResponse {
  error: {
    message: string;
    type: string;
    code: string | null;
  };
}

/**
 * Validate that the OpenAI API key is configured.
 * Throws a descriptive error if the key is missing or empty.
 */
function requireApiKey(): string {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey || apiKey.trim() === "") {
    throw new Error(
      "OpenAI API key is not configured. " +
        "Set OPENAI_API_KEY in your .env file or use EMBEDDING_PROVIDER=mock for development."
    );
  }
  return apiKey;
}

/**
 * Call the OpenAI embeddings API with the given input.
 *
 * @param input - A single string or array of strings to embed
 * @param apiKey - The OpenAI API key
 * @returns The parsed API response
 * @throws Error on network issues, auth failures, rate limits, or other API errors
 */
async function callEmbeddingsAPI(
  input: string | string[],
  apiKey: string
): Promise<OpenAIEmbeddingResponse> {
  let response: Response;

  try {
    response = await fetch(OPENAI_EMBEDDINGS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        input,
      }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`OpenAI embeddings API request failed: ${message}`);
  }

  if (!response.ok) {
    let errorMessage: string;

    try {
      const errorBody = (await response.json()) as OpenAIErrorResponse;
      errorMessage = errorBody.error?.message || response.statusText;
    } catch {
      errorMessage = response.statusText;
    }

    switch (response.status) {
      case 401:
        throw new Error(
          `OpenAI API authentication failed: ${errorMessage}. Check your OPENAI_API_KEY.`
        );
      case 429:
        throw new Error(
          `OpenAI API rate limit exceeded: ${errorMessage}. Please retry after a short delay.`
        );
      case 400:
        throw new Error(
          `OpenAI API bad request: ${errorMessage}. Check the input text.`
        );
      case 500:
      case 502:
      case 503:
        throw new Error(
          `OpenAI API server error (${response.status}): ${errorMessage}. Please retry later.`
        );
      default:
        throw new Error(
          `OpenAI API error (${response.status}): ${errorMessage}`
        );
    }
  }

  return (await response.json()) as OpenAIEmbeddingResponse;
}

/**
 * OpenAI embedding provider using the text-embedding-3-small model.
 *
 * Produces 1536-dimensional normalized embedding vectors via the OpenAI API.
 * Supports both single and batch embedding requests.
 */
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name = PROVIDER_NAME;

  /**
   * Generate an embedding vector for a single text input.
   *
   * @param text - Input text to embed
   * @returns Embedding result with 1536-dimensional vector
   * @throws Error if the API key is missing or the API call fails
   */
  async embed(text: string): Promise<EmbeddingResult> {
    const apiKey = requireApiKey();
    const response = await callEmbeddingsAPI(text, apiKey);

    if (!response.data || response.data.length === 0) {
      throw new Error("OpenAI API returned no embedding data.");
    }

    return {
      embedding: response.data[0].embedding,
      provider: PROVIDER_NAME,
      model: MODEL,
      dimensions: DIMENSIONS,
    };
  }

  /**
   * Generate embedding vectors for multiple texts in a single API call.
   *
   * OpenAI supports batch embedding natively, which is more efficient than
   * sequential calls. Inputs exceeding the max batch size are chunked.
   *
   * @param texts - Array of input texts to embed
   * @returns Array of embedding results in the same order as inputs
   * @throws Error if the API key is missing or the API call fails
   */
  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    if (texts.length === 0) {
      return [];
    }

    const apiKey = requireApiKey();

    // Chunk into batches if needed
    const results: EmbeddingResult[] = [];

    for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
      const batch = texts.slice(i, i + MAX_BATCH_SIZE);
      const response = await callEmbeddingsAPI(batch, apiKey);

      if (!response.data || response.data.length !== batch.length) {
        throw new Error(
          `OpenAI API returned ${response.data?.length ?? 0} embeddings for ${batch.length} inputs.`
        );
      }

      // API may return data out of order; sort by index
      const sorted = [...response.data].sort((a, b) => a.index - b.index);

      for (const item of sorted) {
        results.push({
          embedding: item.embedding,
          provider: PROVIDER_NAME,
          model: MODEL,
          dimensions: DIMENSIONS,
        });
      }
    }

    return results;
  }
}
