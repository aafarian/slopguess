/**
 * OpenAI DALL-E image generation provider.
 *
 * Calls the OpenAI Images API directly via fetch (no SDK dependency).
 * Uses DALL-E 3 by default with 1024x1024 resolution.
 * Requires OPENAI_API_KEY to be set when IMAGE_PROVIDER=openai.
 */

import { env } from "../../config/env";
import type { ImageGenerationProvider, ImageGenerationResult } from "./types";

/** OpenAI Images API endpoint */
const OPENAI_IMAGES_URL = "https://api.openai.com/v1/images/generations";

/** Shape of the OpenAI Images API response */
interface OpenAIImagesResponse {
  created: number;
  data: Array<{
    url?: string;
    revised_prompt?: string;
  }>;
}

/** Shape of the OpenAI API error response */
interface OpenAIErrorResponse {
  error: {
    message: string;
    type: string;
    code: string | null;
  };
}

export class OpenAIImageProvider implements ImageGenerationProvider {
  readonly name = "openai";
  private readonly apiKey: string;

  constructor() {
    const key = env.OPENAI_API_KEY;

    if (!key || key.trim() === "") {
      throw new Error(
        "OPENAI_API_KEY is required when IMAGE_PROVIDER=openai. " +
          "Set OPENAI_API_KEY in your .env file or environment, " +
          "or use IMAGE_PROVIDER=mock for development."
      );
    }

    this.apiKey = key;
  }

  async generate(prompt: string): Promise<ImageGenerationResult> {
    if (!prompt || prompt.trim() === "") {
      throw new Error("Image generation prompt must not be empty.");
    }

    const body = {
      model: "dall-e-3",
      prompt,
      n: 1,
      size: "1024x1024",
      response_format: "url",
    };

    let response: Response;

    try {
      response = await fetch(OPENAI_IMAGES_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Unknown network error";
      throw new Error(
        `OpenAI API request failed (network error): ${message}`
      );
    }

    if (!response.ok) {
      await this.handleErrorResponse(response);
    }

    const json = (await response.json()) as OpenAIImagesResponse;

    if (!json.data || json.data.length === 0 || !json.data[0].url) {
      throw new Error(
        "OpenAI API returned an unexpected response: no image URL in response data."
      );
    }

    const imageData = json.data[0];

    return {
      imageUrl: imageData.url!,
      provider: this.name,
      metadata: {
        model: "dall-e-3",
        size: "1024x1024",
        revisedPrompt: imageData.revised_prompt,
        created: json.created,
      },
    };
  }

  /**
   * Parse and throw a descriptive error from a non-OK OpenAI API response.
   */
  private async handleErrorResponse(response: Response): Promise<never> {
    let errorMessage: string;

    try {
      const errorJson = (await response.json()) as OpenAIErrorResponse;
      errorMessage = errorJson.error?.message || "Unknown API error";
    } catch {
      errorMessage = `HTTP ${response.status} ${response.statusText}`;
    }

    switch (response.status) {
      case 401:
        throw new Error(
          `OpenAI API authentication failed: ${errorMessage}. ` +
            "Check that your OPENAI_API_KEY is valid."
        );
      case 429:
        throw new Error(
          `OpenAI API rate limit exceeded: ${errorMessage}. ` +
            "Please wait before retrying or check your usage limits."
        );
      case 400:
        throw new Error(
          `OpenAI API request rejected: ${errorMessage}. ` +
            "This may be due to a content policy violation or invalid parameters."
        );
      default:
        throw new Error(
          `OpenAI API error (HTTP ${response.status}): ${errorMessage}`
        );
    }
  }
}
