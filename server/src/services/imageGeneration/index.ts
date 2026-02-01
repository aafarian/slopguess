/**
 * Image generation service — factory and re-exports.
 *
 * Provides a factory function that returns the configured image generation
 * provider based on the IMAGE_PROVIDER env variable. Defaults to the mock
 * provider when no provider is specified or when IMAGE_PROVIDER=mock.
 */

import { env } from "../../config/env";
import { MockImageProvider } from "./mockProvider";
import { OpenAIImageProvider } from "./openaiProvider";
import type { ImageGenerationProvider, ImageGenerationResult } from "./types";

export type { ImageGenerationProvider, ImageGenerationResult };

/**
 * Create an image generation provider by name.
 *
 * @param providerName - The provider to instantiate ("mock", "openai", etc.)
 * @returns An ImageGenerationProvider instance
 * @throws Error if the provider name is not recognized
 */
export function createImageProvider(
  providerName: string
): ImageGenerationProvider {
  switch (providerName.toLowerCase()) {
    case "mock":
      return new MockImageProvider();

    case "openai":
      return new OpenAIImageProvider();

    default:
      throw new Error(
        `Unknown image provider: "${providerName}". ` +
          `Supported providers: mock, openai. ` +
          `Set IMAGE_PROVIDER in your environment or .env file.`
      );
  }
}

/**
 * Get the image generation provider based on current env config.
 *
 * Reads IMAGE_PROVIDER from env and returns the corresponding provider.
 * Defaults to "mock" if not set.
 *
 * @returns An ImageGenerationProvider instance
 */
export function getImageProvider(): ImageGenerationProvider {
  return createImageProvider(env.IMAGE_PROVIDER);
}
