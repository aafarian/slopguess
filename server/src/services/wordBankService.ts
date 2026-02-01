/**
 * Word bank service.
 *
 * Provides methods to query, select, and manage words from the word_bank table.
 * Key features:
 * - Random word selection with anti-repetition (least-recently-used preference)
 * - Category-balanced selection
 * - Prompt assembly from random words
 * - Usage tracking via last_used_at
 */

import { pool } from "../config/database";
import type { WordBankRow, WordBankEntry } from "../models/wordBank";
import { toWordBankEntry } from "../models/wordBank";

// ---------------------------------------------------------------------------
// Prompt templates for assembling words into image generation prompts.
// The service picks a template and fills in the blanks with selected words.
// ---------------------------------------------------------------------------

interface PromptTemplate {
  /** How many words from each category the template needs */
  slots: {
    adjective?: number;
    noun?: number; // animals, objects, mythical creatures, vehicles, professions
    action?: number;
    setting?: number;
    style?: number;
    extra?: number; // materials, colors, body parts, etc.
  };
  /** Template function that builds the prompt string */
  build: (parts: { adjectives: string[]; nouns: string[]; actions: string[]; settings: string[]; styles: string[]; extras: string[] }) => string;
}

/** Categories that count as "nouns" for prompt assembly */
const NOUN_CATEGORIES = new Set([
  "animals",
  "mythical creatures",
  "objects",
  "vehicles",
  "professions",
  "foods",
  "musical instruments",
  "nature",
]);

/** Categories that count as "extras" — modifiers, materials, colors, etc. */
const EXTRA_CATEGORIES = new Set([
  "colors",
  "materials",
  "body parts",
  "emotions",
  "weather",
  "time periods",
  "abstract concepts",
]);

const PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    slots: { adjective: 1, noun: 1, action: 1, setting: 1 },
    build: (p) =>
      `a ${p.adjectives[0]} ${p.nouns[0]} ${p.actions[0]} in ${p.settings[0]}`,
  },
  {
    slots: { adjective: 1, noun: 2, action: 1 },
    build: (p) =>
      `a ${p.adjectives[0]} ${p.nouns[0]} and a ${p.nouns[1]} ${p.actions[0]} together`,
  },
  {
    slots: { noun: 1, action: 1, setting: 1, extra: 1 },
    build: (p) =>
      `a ${p.extras[0]} ${p.nouns[0]} ${p.actions[0]} in ${p.settings[0]}`,
  },
  {
    slots: { adjective: 1, noun: 1, setting: 1, style: 1 },
    build: (p) =>
      `a ${p.adjectives[0]} ${p.nouns[0]} in ${p.settings[0]}, ${p.styles[0]} style`,
  },
  {
    slots: { noun: 1, action: 1, extra: 2 },
    build: (p) =>
      `a ${p.extras[0]} ${p.nouns[0]} made of ${p.extras[1]} ${p.actions[0]}`,
  },
  {
    slots: { adjective: 1, noun: 2, setting: 1 },
    build: (p) =>
      `a ${p.adjectives[0]} ${p.nouns[0]} riding a ${p.nouns[1]} through ${p.settings[0]}`,
  },
  {
    slots: { noun: 1, action: 1, extra: 1, setting: 1 },
    build: (p) =>
      `a ${p.nouns[0]} with ${p.extras[0]} ${p.actions[0]} on ${p.settings[0]}`,
  },
  {
    slots: { adjective: 2, noun: 1, action: 1 },
    build: (p) =>
      `a ${p.adjectives[0]} and ${p.adjectives[1]} ${p.nouns[0]} ${p.actions[0]}`,
  },
];

// ---------------------------------------------------------------------------
// Service methods
// ---------------------------------------------------------------------------

/**
 * Get N random words from the word bank, preferring words not recently used.
 *
 * Strategy:
 * 1. First try to get words where last_used_at IS NULL (never used).
 * 2. If not enough, get words ordered by last_used_at ASC (least recently used first).
 * 3. Apply category balancing: try not to pick more than 2 from the same category.
 *
 * @param count Number of words to select (default: 5)
 * @param excludeRoundCount How many recent rounds' worth of words to exclude (default: 30)
 * @returns Array of WordBankEntry objects
 */
async function getRandomWords(
  count: number = 5,
  excludeRoundCount: number = 30
): Promise<WordBankEntry[]> {
  // Calculate the cutoff time: exclude words used in approximately the last N rounds
  // Assume ~5 minutes per round average, so N rounds = N * 5 minutes
  const minutesCutoff = excludeRoundCount * 5;

  // Try to get unused words first, falling back to least-recently-used
  const query = `
    WITH ranked_words AS (
      SELECT *,
        CASE
          WHEN last_used_at IS NULL THEN 0
          WHEN last_used_at < NOW() - INTERVAL '${minutesCutoff} minutes' THEN 1
          ELSE 2
        END AS usage_tier
      FROM word_bank
    ),
    category_counts AS (
      SELECT category, COUNT(*) as cat_count
      FROM word_bank
      GROUP BY category
    )
    SELECT rw.*
    FROM ranked_words rw
    ORDER BY
      rw.usage_tier ASC,
      RANDOM()
    LIMIT $1
  `;

  try {
    const result = await pool.query<WordBankRow>(query, [count * 3]);

    if (result.rows.length === 0) {
      console.warn("[wordBankService] No words found in word bank. Has seed been run?");
      return [];
    }

    // Apply category balancing: pick from diverse categories
    const selected: WordBankRow[] = [];
    const categoryCount = new Map<string, number>();
    const maxPerCategory = Math.max(2, Math.ceil(count / 3));

    for (const row of result.rows) {
      if (selected.length >= count) break;

      const catCount = categoryCount.get(row.category) || 0;
      if (catCount < maxPerCategory) {
        selected.push(row);
        categoryCount.set(row.category, catCount + 1);
      }
    }

    // If we still need more (category balancing was too strict), fill from remaining
    if (selected.length < count) {
      const selectedIds = new Set(selected.map((s) => s.id));
      for (const row of result.rows) {
        if (selected.length >= count) break;
        if (!selectedIds.has(row.id)) {
          selected.push(row);
        }
      }
    }

    if (selected.length < count) {
      console.warn(
        `[wordBankService] Requested ${count} words but only ${selected.length} available. ` +
          `Consider adding more words to the bank.`
      );
    }

    return selected.map(toWordBankEntry);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[wordBankService] getRandomWords failed:", message);
    throw err;
  }
}

/**
 * Assemble a short, coherent-ish prompt for image generation from selected words.
 *
 * Takes an array of words (strings) and combines them into a descriptive prompt
 * using template patterns. If no template fits perfectly, falls back to a
 * simple comma-joined format.
 *
 * @param words Array of word strings to combine
 * @returns A short descriptive prompt string
 */
function assemblePrompt(words: string[]): string {
  if (words.length === 0) return "a mysterious scene";
  if (words.length === 1) return `a ${words[0]}`;

  // Just join them into a simple, evocative prompt
  // Format: "a [word1] [word2] [word3] in [word4]" style
  // The simplest approach that produces good image generation prompts
  if (words.length === 2) {
    return `a ${words[0]} ${words[1]}`;
  }

  if (words.length === 3) {
    return `a ${words[0]} ${words[1]} with ${words[2]}`;
  }

  if (words.length <= 5) {
    const mid = Math.floor(words.length / 2);
    const firstHalf = words.slice(0, mid).join(" ");
    const secondHalf = words.slice(mid).join(" and ");
    return `a ${firstHalf} in ${secondHalf}`;
  }

  // For 6+ words, pick the most interesting subset
  const subset = words.slice(0, 5);
  return `a ${subset[0]} ${subset[1]} ${subset[2]} with ${subset[3]} and ${subset[4]}`;
}

/**
 * Assemble a prompt using category-aware templates for better coherence.
 *
 * This version looks up word categories and uses structured templates
 * to produce prompts like "a melancholic octopus juggling in a volcano".
 *
 * @param wordEntries Array of WordBankEntry objects (with category info)
 * @returns A short descriptive prompt string
 */
function assemblePromptFromEntries(wordEntries: WordBankEntry[]): string {
  if (wordEntries.length === 0) return "a mysterious scene";

  // Bucket words by prompt role
  const adjectives: string[] = [];
  const nouns: string[] = [];
  const actions: string[] = [];
  const settings: string[] = [];
  const styles: string[] = [];
  const extras: string[] = [];

  for (const entry of wordEntries) {
    const cat = entry.category;
    if (cat === "adjectives" || cat === "emotions") {
      adjectives.push(entry.word);
    } else if (NOUN_CATEGORIES.has(cat)) {
      nouns.push(entry.word);
    } else if (cat === "actions") {
      actions.push(entry.word);
    } else if (cat === "settings") {
      settings.push(entry.word);
    } else if (cat === "styles") {
      styles.push(entry.word);
    } else if (EXTRA_CATEGORIES.has(cat)) {
      extras.push(entry.word);
    } else {
      // Unknown category — treat as extra
      extras.push(entry.word);
    }
  }

  // Try to find a matching template
  for (const template of PROMPT_TEMPLATES) {
    const s = template.slots;
    const needAdj = s.adjective || 0;
    const needNoun = s.noun || 0;
    const needAction = s.action || 0;
    const needSetting = s.setting || 0;
    const needStyle = s.style || 0;
    const needExtra = s.extra || 0;

    if (
      adjectives.length >= needAdj &&
      nouns.length >= needNoun &&
      actions.length >= needAction &&
      settings.length >= needSetting &&
      styles.length >= needStyle &&
      extras.length >= needExtra
    ) {
      return template.build({
        adjectives: adjectives.slice(0, needAdj),
        nouns: nouns.slice(0, needNoun),
        actions: actions.slice(0, needAction),
        settings: settings.slice(0, needSetting),
        styles: styles.slice(0, needStyle),
        extras: extras.slice(0, needExtra),
      });
    }
  }

  // Fallback: simple concatenation of all words
  const allWords = wordEntries.map((e) => e.word);
  return assemblePrompt(allWords);
}

/**
 * Update last_used_at for the specified word IDs.
 *
 * @param wordIds Array of word_bank IDs to mark as used
 */
async function markWordsUsed(wordIds: number[]): Promise<void> {
  if (wordIds.length === 0) return;

  try {
    await pool.query(
      `UPDATE word_bank
       SET last_used_at = NOW()
       WHERE id = ANY($1)`,
      [wordIds]
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[wordBankService] markWordsUsed failed:", message);
    throw err;
  }
}

/**
 * Get the total count of words in the bank.
 */
async function getWordCount(): Promise<number> {
  const result = await pool.query("SELECT COUNT(*)::int AS count FROM word_bank");
  return result.rows[0].count;
}

/**
 * Get all words from the word bank.
 *
 * @param page Page number (1-indexed, default: 1)
 * @param limit Words per page (default: 50)
 * @returns Object with words array and pagination metadata
 */
async function getAllWords(
  page: number = 1,
  limit: number = 50
): Promise<{
  words: WordBankEntry[];
  total: number;
  page: number;
  totalPages: number;
}> {
  const offset = (page - 1) * limit;

  const [wordsResult, countResult] = await Promise.all([
    pool.query<WordBankRow>(
      `SELECT * FROM word_bank ORDER BY category, word LIMIT $1 OFFSET $2`,
      [limit, offset]
    ),
    pool.query<{ count: number }>("SELECT COUNT(*)::int AS count FROM word_bank"),
  ]);

  const total = countResult.rows[0].count;

  return {
    words: wordsResult.rows.map(toWordBankEntry),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Get all words in a specific category.
 *
 * @param category The category to filter by
 * @returns Array of WordBankEntry objects in that category
 */
async function getWordsByCategory(category: string): Promise<WordBankEntry[]> {
  const result = await pool.query<WordBankRow>(
    `SELECT * FROM word_bank WHERE category = $1 ORDER BY word`,
    [category]
  );
  return result.rows.map(toWordBankEntry);
}

/**
 * Get all distinct categories in the word bank.
 *
 * @returns Array of category names with word counts
 */
async function getCategories(): Promise<{ category: string; count: number }[]> {
  const result = await pool.query<{ category: string; count: number }>(
    `SELECT category, COUNT(*)::int AS count
     FROM word_bank
     GROUP BY category
     ORDER BY category`
  );
  return result.rows;
}

/**
 * Get a random subset of words as a convenience wrapper.
 * Alias for getRandomWords with default parameters.
 */
async function getRandomSubset(count: number): Promise<WordBankEntry[]> {
  return getRandomWords(count);
}

export const wordBankService = {
  getRandomWords,
  getRandomSubset,
  assemblePrompt,
  assemblePromptFromEntries,
  markWordsUsed,
  getWordCount,
  getAllWords,
  getWordsByCategory,
  getCategories,
};
