/**
 * Mock image generation provider.
 *
 * Returns placeholder image URLs for development and testing without
 * requiring external API keys. Uses picsum.photos with a deterministic
 * seed derived from the prompt so the same prompt always yields the
 * same placeholder image.
 */

import type { ImageGenerationOptions, ImageGenerationProvider, ImageGenerationResult } from "./types";

/**
 * Simple string hash function that produces a positive integer.
 * Used to generate a deterministic seed for the placeholder image URL.
 */
function hashPrompt(prompt: string): number {
  let hash = 0;
  for (let i = 0; i < prompt.length; i++) {
    const char = prompt.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

export class MockImageProvider implements ImageGenerationProvider {
  readonly name = "mock";

  async generate(prompt: string, _options?: ImageGenerationOptions): Promise<ImageGenerationResult> {
    const seed = hashPrompt(prompt);

    // picsum.photos supports deterministic images via /seed/{seed}/{width}/{height}
    const imageUrl = `https://picsum.photos/seed/${seed}/1024/1024`;

    return {
      imageUrl,
      provider: this.name,
      metadata: {
        prompt,
        seed,
        note: "Mock provider - placeholder image for development",
      },
    };
  }
}
