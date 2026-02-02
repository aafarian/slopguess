/**
 * LLM-powered prompt generator.
 *
 * Replaces rigid template-based prompt assembly with a GPT-4o-mini call that
 * creatively combines word bank seeds. Falls back to the existing template
 * assembler (wordBankService.assemblePromptFromEntries) on any failure.
 *
 * Anti-bias strategy:
 * 1. Word bank randomness (existing) -- LRU-based selection ensures diverse raw material
 * 2. System prompt rotation -- personas push the LLM into different creative modes
 * 3. Recent prompt blacklist -- last 10 prompts sent as negative examples
 * 4. High temperature (1.2) -- increases token sampling randomness
 */

import { env } from "../config/env";
import { logger } from "../config/logger";
import { pool } from "../config/database";
import type { WordBankEntry } from "../models/wordBank";
import { wordBankService } from "./wordBankService";
import { containsBlockedContent } from "./contentFilter";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-4o-mini";
const TEMPERATURE = 1.0;
const MAX_TOKENS = 200;
const MAX_PROMPT_LENGTH = 500;
const RECENT_PROMPT_COUNT = 10;

// ---------------------------------------------------------------------------
// Persona rotation
// ---------------------------------------------------------------------------

const PERSONAS: string[] = [
  "You are a photographer describing a striking everyday scene.",
  "You are a film director pitching a striking single scene.",
  "You are a photojournalist captioning an award-winning photograph.",
  "You are a children's book illustrator dreaming up a whimsical page.",
  "You are a travel blogger describing a memorable moment from a trip.",
  "You are a nature documentary narrator describing a never-before-seen moment.",
  "You are a street artist planning an eye-catching mural.",
  "You are an animator storyboarding a key frame for a short film.",
];

let personaIndex = 0;

function nextPersona(): string {
  const persona = PERSONAS[personaIndex];
  personaIndex = (personaIndex + 1) % PERSONAS.length;
  return persona;
}

// ---------------------------------------------------------------------------
// Recent prompt blacklist
// ---------------------------------------------------------------------------

async function getRecentPrompts(): Promise<string[]> {
  try {
    const result = await pool.query<{ prompt: string }>(
      `SELECT prompt FROM rounds ORDER BY created_at DESC LIMIT $1`,
      [RECENT_PROMPT_COUNT]
    );
    return result.rows.map((r) => r.prompt);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Check that the LLM output is a usable image prompt:
 * non-empty, under length cap, no meta-language.
 */
function isValidPrompt(text: string): boolean {
  if (!text || text.trim().length === 0) return false;
  if (text.length > MAX_PROMPT_LENGTH) return false;

  const metaPatterns = [
    /\bhere is\b/i,
    /\bhere's\b/i,
    /\bsure\b/i,
    /\bof course\b/i,
    /\bi would\b/i,
    /\bprompt:/i,
    /\bdescription:/i,
    /\btitle:/i,
  ];
  for (const pattern of metaPatterns) {
    if (pattern.test(text)) return false;
  }

  // Reject prompts containing offensive / blocked content
  if (containsBlockedContent(text)) return false;

  return true;
}

// ---------------------------------------------------------------------------
// OpenAI Chat Completions call
// ---------------------------------------------------------------------------

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatCompletionResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

interface ChatErrorResponse {
  error: {
    message: string;
    type: string;
    code: string | null;
  };
}

async function callChatAPI(messages: ChatMessage[]): Promise<string> {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey || apiKey.trim() === "") {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  let response: Response;

  try {
    response = await fetch(OPENAI_CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: TEMPERATURE,
        max_tokens: MAX_TOKENS,
      }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`OpenAI Chat API request failed (network): ${message}`);
  }

  if (!response.ok) {
    let errorMessage: string;
    try {
      const errorBody = (await response.json()) as ChatErrorResponse;
      errorMessage = errorBody.error?.message || response.statusText;
    } catch {
      errorMessage = `HTTP ${response.status} ${response.statusText}`;
    }

    switch (response.status) {
      case 401:
        throw new Error(
          `OpenAI Chat API auth failed: ${errorMessage}. Check OPENAI_API_KEY.`
        );
      case 429:
        throw new Error(
          `OpenAI Chat API rate limited: ${errorMessage}.`
        );
      default:
        throw new Error(
          `OpenAI Chat API error (${response.status}): ${errorMessage}`
        );
    }
  }

  const json = (await response.json()) as ChatCompletionResponse;

  if (!json.choices || json.choices.length === 0 || !json.choices[0].message?.content) {
    throw new Error("OpenAI Chat API returned no content.");
  }

  return json.choices[0].message.content.trim();
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/** Return type for prompt generation — includes the source for tracking. */
export interface PromptGenerationResult {
  prompt: string;
  source: 'llm' | 'template';
}

/**
 * Generate a creative image prompt using GPT-4o-mini, seeded with word bank
 * entries. Falls back to template-based assembly on any failure.
 *
 * @param wordEntries - Word bank entries selected for this round
 * @returns The generated prompt string and its source ('llm' or 'template')
 */
async function generatePromptFromWords(
  wordEntries: WordBankEntry[]
): Promise<PromptGenerationResult> {
  // Fallback helper
  const fallback = async (): Promise<PromptGenerationResult> => ({
    prompt: wordBankService.assemblePromptFromEntries(wordEntries),
    source: 'template',
  });

  if (wordEntries.length === 0) {
    return fallback();
  }

  // Don't attempt LLM call if API key is missing -- go straight to fallback
  if (!env.OPENAI_API_KEY || env.OPENAI_API_KEY.trim() === "") {
    logger.debug("promptGenerator", "No OPENAI_API_KEY configured, using template fallback");
    return fallback();
  }

  try {
    // Gather word seeds grouped by category
    const wordList = wordEntries
      .map((e) => `${e.word} (${e.category})`)
      .join(", ");

    // Gather recent prompts to avoid repetition
    const recentPrompts = await getRecentPrompts();
    const blacklistSection =
      recentPrompts.length > 0
        ? `\n\nDo NOT produce anything resembling these recent prompts:\n${recentPrompts.map((p) => `- "${p}"`).join("\n")}`
        : "";

    const systemPrompt = nextPersona();

    const userPrompt =
      `Compose an image-generation prompt (2-3 sentences, 150-350 characters) ` +
      `that naturally incorporates ALL of these words: ${wordList}. ` +
      `Describe a busy, detailed scene with lots of things happening that someone could point to and name. ` +
      `Use simple, normal, everyday words — the kind a 10-year-old would use. ` +
      `Fill the scene with specific, recognizable objects, people, animals, and actions. ` +
      `No fancy vocabulary, no metaphors, no abstract ideas. Just a packed scene described in plain English. ` +
      `Output ONLY the prompt text, nothing else.${blacklistSection}`;

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    const raw = await callChatAPI(messages);

    // Strip wrapping quotes if the LLM added them
    const cleaned = raw.replace(/^["']|["']$/g, "");

    if (!isValidPrompt(cleaned)) {
      logger.warn("promptGenerator", "LLM output failed validation, using fallback", {
        raw: raw.substring(0, 250),
      });
      return fallback();
    }

    logger.info("promptGenerator", "Generated LLM prompt", {
      prompt: cleaned,
      wordCount: wordEntries.length,
    });

    return { prompt: cleaned, source: 'llm' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn("promptGenerator", "LLM prompt generation failed, using fallback", {
      error: message,
    });
    return fallback();
  }
}

export const promptGenerator = {
  generatePromptFromWords,
};
