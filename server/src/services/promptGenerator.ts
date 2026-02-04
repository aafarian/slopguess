/**
 * LLM-powered prompt generator.
 *
 * Replaces rigid template-based prompt assembly with a GPT-4o-mini call that
 * creatively combines word bank seeds. Falls back to the existing template
 * assembler (wordBankService.assemblePromptFromEntries) on any failure.
 *
 * Anti-bias strategy:
 * 1. Word bank randomness (existing) -- LRU-based selection ensures diverse raw material
 * 2. Wild card rotation -- ~40 specific creative constraints push the LLM in unique directions
 * 3. Variable scene shapes -- different word-role distributions per round
 * 4. Recent prompt blacklist -- last 10 prompts sent as negative examples
 * 5. No example prompts -- avoids anchoring the LLM to patterns
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
const MAX_TOKENS = 80;
const RECENT_PROMPT_COUNT = 10;

// ---------------------------------------------------------------------------
// Wild cards — specific creative constraints, one picked at random per round
// ---------------------------------------------------------------------------

const WILD_CARDS: string[] = [
  // Perspective & viewpoint
  "The scene is viewed from above, as if looking straight down from the sky.",
  "Everything in the scene is reflected in a puddle on the ground.",
  "The scene takes place inside a snow globe.",

  // Scale & proportion
  "One thing in the scene is 100 times bigger than it should be.",
  "Everything is tiny and fits on a tabletop like a dollhouse scene.",
  "Something very small is being used as if it were very large.",

  // Situation & context
  "It is picture day and everyone in the scene is posing for a photo.",
  "The scene is a news broadcast and something weird is happening in the background.",
  "Everyone in the scene is pretending nothing unusual is happening.",
  "The scene is a wanted poster that has come to life.",
  "It is the first day on the job and everything is going wrong.",
  "Someone in the scene just won a trophy for something ridiculous.",
  "This is a family photo but the family members are all wrong.",

  // Physics & impossibility
  "Gravity is sideways — everything is stuck to a wall instead of the floor.",
  "The scene is half underwater and half above water, split down the middle.",
  "Everything in the scene is floating a few inches off the ground.",
  "Two completely different scenes are happening on the left and right halves.",

  // Composition & style
  "The scene looks like a cereal box cover.",
  "The scene looks like a page from a children's picture book.",
  "The scene looks like a surveillance camera caught something weird.",
  "The scene is a birthday party for something that should not have a birthday.",

  // Interaction & relationship
  "Two things that have nothing to do with each other are having a staring contest.",
  "Something is being used as a chair even though it is not a chair.",
  "Someone is giving a tour and showing off something completely ordinary as if it were amazing.",
  "Something is hiding but doing a terrible job of it.",
  "There is a long line of things waiting for something unexpected.",

  // Environment & setting twists
  "The whole scene is built out of food.",
  "The scene takes place on top of a much larger version of something ordinary.",
  "Everything is covered in wrapping paper like a present.",
  "Normal room, but the floor is replaced with something it should not be.",

  // Mood & moment
  "The scene captures the exact moment something goes hilariously wrong.",
  "Everyone in the scene is asleep except one thing that is wide awake.",
  "The scene is very organized and tidy but one thing is in total chaos.",
  "Something is melting that should not be melting.",
  "This is the world's worst parade.",
  "The scene is a race and the competitors make no sense.",
  "Something is being delivered to the wrong address.",
  "This is what the inside of a vending machine looks like.",
  "Two things are swapped — each one is where the other should be.",
];

const SYSTEM_PROMPT = "You write single-sentence image captions (no 'is' or 'are' — write 'a frog sitting' not 'a frog is sitting'). Include: one main character doing one action in a setting, plus 2-3 extra weird visual details (what things are made of, what colors they are, what else is in the scene). Be specific — say 'a purple top hat' not just 'a hat'. Use only simple words a 10-year-old would know. The main character should usually be an animal, creature, or object — only occasionally a person. Never use 'while' — use 'with', 'and', or 'next to' instead.";

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
 * non-empty, under the DB column limit, no meta-language.
 */
function isValidPrompt(text: string): boolean {
  if (!text || text.trim().length === 0) return false;
  if (text.length > env.PROMPT_MAX_LENGTH) return false;

  const metaPatterns = [
    /\bhere is\b/i,
    /\bhere's\b/i,
    /\bsure\b/i,
    /\bof course\b/i,
    /\bi would\b/i,
    /\bprompt:/i,
    /\bdescription:/i,
    /\btitle:/i,
    /\bfeeling\b/i,
    /\bemotion\b/i,
    /\bsense of\b/i,
    /\bspirit of\b/i,
    /\bessence of\b/i,
    /\bsymbolizes\b/i,
    /\bembodies\b/i,
    /\bevokes\b/i,
    /\btriumphant\b/i,
    /\bmelancholic\b/i,
    /\bnostalgic\b/i,
    /\bexistential\b/i,
    /\bphilosophical\b/i,
    // Decorative / dramatic words that don't describe visible things
    /\bkingdom\b/i,
    /\brealm\b/i,
    /\bparadise\b/i,
    /\bwonderland\b/i,
    /\bmajest/i,
    /\bmagnificen/i,
    /\bwhimsical\b/i,
    /\bethereal\b/i,
    /\bmystical\b/i,
    /\benchant/i,
    /\bglorious\b/i,
    /\bwondrous\b/i,
    /\bspectacle\b/i,
    /\bsplendor\b/i,
    /\bharmony\b/i,
    /\bdreamlike\b/i,
    /\bfantastical\b/i,
    // Text-on-things — DALL-E can't render readable text
    /\btitled\b/i,
    /\blabeled\b/i,
    /\bwritten\b/i,
    /\bwriting\b/i,
    /\bthat says\b/i,
    /\bthat reads\b/i,
    /\bsign reading\b/i,
    /\bsign that\b/i,
    /\bbanner reading\b/i,
    /\bwith the words\b/i,
    /\bwith the text\b/i,
    /\bspells out\b/i,
    // Hyphenated compound adjectives — overly literary, use simple words
    /\b\w+-soaked\b/i,
    /\b\w+-covered\b/i,
    /\b\w+-shaped\b/i,
    /\b\w+-filled\b/i,
    /\b\w+-sized\b/i,
    /\b\w+-themed\b/i,
    /\b\w+-colored\b/i,
    /\b\w+-powered\b/i,
    /\b\w+-infused\b/i,
    /\b\w+-laden\b/i,
    /\b\w+-flavored\b/i,
    /\b\w+-tipped\b/i,
    /\b\w+-studded\b/i,
    /\b\w+-striped\b/i,
    /\b\w+-encrusted\b/i,
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
    // Send just the raw words — no categories, so the LLM doesn't try to
    // use them "correctly" and instead combines them in unexpected ways.
    const wordList = wordEntries
      .map((e) => e.word)
      .join(", ");

    // Gather recent prompts to avoid repetition
    const recentPrompts = await getRecentPrompts();
    const blacklistSection =
      recentPrompts.length > 0
        ? `\n\nDo NOT produce anything resembling these recent prompts:\n${recentPrompts.map((p) => `- "${p}"`).join("\n")}`
        : "";

    const wildCard = WILD_CARDS[Math.floor(Math.random() * WILD_CARDS.length)];

    const userPrompt =
      `Creative direction: ${wildCard}\n\n` +
      `Write ONE sentence using these words: ${wordList}. ` +
      `Include: one character doing one action in a setting, plus 2-3 extra weird details about the scene. ` +
      `Be specific about what things look like (colors, materials, sizes). ` +
      `Use the given words as-is — do not add adjectives to them (say "library" not "dusty library"). ` +
      `Do not invent your own setting — use a setting from the word list if one is there. ` +
      `Keep it weird and fun. ` +
      `Output ONLY the sentence.${blacklistSection}`;

    // Retry the LLM up to 3 times before falling back to templates.
    // Each attempt picks a fresh wild card for variety.
    const MAX_LLM_RETRIES = 3;
    for (let attempt = 1; attempt <= MAX_LLM_RETRIES; attempt++) {
      // Pick a fresh wild card on retries
      const retryWildCard = attempt === 1 ? wildCard : WILD_CARDS[Math.floor(Math.random() * WILD_CARDS.length)];
      const retryUserPrompt = attempt === 1 ? userPrompt : userPrompt.replace(
        `Creative direction: ${wildCard}`,
        `Creative direction: ${retryWildCard}`
      );

      const retryMessages: ChatMessage[] = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: retryUserPrompt },
      ];

      const raw = await callChatAPI(retryMessages);

      // Strip wrapping quotes if the LLM added them
      const cleaned = raw.replace(/^["']|["']$/g, "");

      if (isValidPrompt(cleaned)) {
        logger.info("promptGenerator", "Generated LLM prompt", {
          prompt: cleaned,
          wordCount: wordEntries.length,
          attempt,
        });
        return { prompt: cleaned, source: 'llm' };
      }

      logger.warn("promptGenerator", `LLM attempt ${attempt}/${MAX_LLM_RETRIES} failed validation`, {
        raw: raw.substring(0, 300),
        length: cleaned.length,
      });
    }

    logger.warn("promptGenerator", "All LLM attempts failed validation, using fallback");
    return fallback();
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
