/**
 * Provider-agnostic image generation interface.
 *
 * Per TR-002, image generation uses an adapter/strategy pattern so that
 * the underlying provider (OpenAI DALL-E, mock, etc.) can be swapped
 * via configuration without changing consuming code.
 */

export interface ImageGenerationOptions {
  quality?: "low" | "medium" | "high";
}

export interface ImageGenerationProvider {
  /** Human-readable name of this provider (e.g. "mock", "openai") */
  name: string;

  /**
   * Generate an image from a text prompt.
   *
   * @param prompt - Descriptive text to generate an image from
   * @param options - Optional generation settings (quality, etc.)
   * @returns The generated image URL and metadata
   */
  generate(prompt: string, options?: ImageGenerationOptions): Promise<ImageGenerationResult>;
}

export interface ImageGenerationResult {
  /** URL of the generated (or placeholder) image — used by URL-based providers */
  imageUrl?: string;
  /** Base64-encoded image data — used by GPT Image models */
  imageBase64?: string;
  /** Name of the provider that produced this image */
  provider: string;
  /** Optional provider-specific metadata */
  metadata?: Record<string, unknown>;
}
