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
import { env } from "../config/env";
import { logger } from "../config/logger";
import type { WordBankRow, WordBankEntry } from "../models/wordBank";
import { toWordBankEntry } from "../models/wordBank";
import { promptVarietyService } from "./promptVarietyService";

// ---------------------------------------------------------------------------
// Prompt templates for assembling words into image generation prompts.
// The service picks a template and fills in the blanks with selected words.
// ---------------------------------------------------------------------------

interface PromptParts {
  adjectives: string[];
  nouns: string[];
  actions: string[];
  settings: string[];
  styles: string[];
  extras: string[];       // materials, colors, body parts
  atmospheres: string[];  // weather, time periods
}

interface PromptTemplate {
  /** How many words from each role the template needs */
  slots: {
    adjective?: number;
    noun?: number;
    action?: number;
    setting?: number;
    style?: number;
    extra?: number;
    atmosphere?: number;
  };
  build: (p: PromptParts) => string;
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

/** Categories that provide tangible modifiers (materials, colors, body parts) */
const EXTRA_CATEGORIES = new Set([
  "colors",
  "materials",
  "body parts",
  "abstract concepts",
]);

/** Categories that set atmosphere / era */
const ATMOSPHERE_CATEGORIES = new Set([
  "weather",
  "time periods",
]);

/** Return "an" if the next word starts with a vowel sound, otherwise "a". */
function aOrAn(word: string): string {
  return /^[aeiou]/i.test(word) ? "an" : "a";
}

/**
 * Wrap a word with an appropriate article.
 * Handles special cases: words that already include articles, plurals,
 * mass nouns, and proper-noun-like terms that need "the".
 */
function withArticle(word: string): string {
  const lower = word.toLowerCase();
  // Already has an article
  if (/^(the |a |an )/.test(lower)) return word;
  // Starts with a number / decade
  if (/^[0-9]/.test(word)) return `the ${word}`;
  // Proper eras / periods that sound better with "the"
  if (/^(medieval|victorian|jurassic|neolithic|bronze age|stone age|ice age|wild west|roaring twenties|renaissance|prohibition|ancient|steampunk era|disco era|space age)/i.test(lower)) {
    return `the ${word}`;
  }
  // Mass/uncountable nouns or settings that don't need an article
  if (/^(space|underwater|outer space)$/i.test(lower)) return word;
  // Plurals (ending in s but not things like "glass")
  if (/s$/.test(lower) && !/ss$|us$/.test(lower)) return word;
  return `${aOrAn(word)} ${word}`;
}

/** Wrap a setting with appropriate preposition + article. */
function inSetting(word: string): string {
  return `in ${withArticle(word)}`;
}

/** Wrap an atmosphere word with appropriate preposition + article. */
function duringAtmosphere(word: string): string {
  const lower = word.toLowerCase();
  // Time periods sound better with "in" or "set in"
  if (ATMOSPHERE_CATEGORIES.has("time periods") && /^(medieval|victorian|jurassic|neolithic|futuristic|cyberpunk|post-apocalyptic|retro|bronze age|stone age|ice age|wild west|roaring twenties|renaissance|prohibition|ancient|steampunk|disco|space age|[0-9])/i.test(lower)) {
    return `set in ${withArticle(word)}`;
  }
  return `during ${withArticle(word)}`;
}

// ---------------------------------------------------------------------------
// Templates — ordered from most words used to fewest.
// The matcher picks the template that consumes the MOST available words.
// ---------------------------------------------------------------------------

const PROMPT_TEMPLATES: PromptTemplate[] = [
  // === 10-slot templates (maximum detail) ================================
  {
    slots: { adjective: 2, noun: 2, action: 1, setting: 1, extra: 2, atmosphere: 1, style: 1 },
    build: (p) =>
      `${withArticle(p.adjectives[0])} and ${p.adjectives[1]} ${p.nouns[0]} wearing ${p.extras[0]} and riding ${withArticle(p.nouns[1])} made of ${p.extras[1]}, ${p.actions[0]} ${inSetting(p.settings[0])} ${duringAtmosphere(p.atmospheres[0])}, in ${p.styles[0]} style`,
  },
  {
    slots: { adjective: 1, noun: 3, action: 1, setting: 1, extra: 2, atmosphere: 1, style: 1 },
    build: (p) =>
      `${withArticle(p.adjectives[0])} ${p.nouns[0]} holding ${withArticle(p.nouns[1])} made of ${p.extras[0]}, ${p.actions[0]} next to ${withArticle(p.nouns[2])} covered in ${p.extras[1]} ${inSetting(p.settings[0])} ${duringAtmosphere(p.atmospheres[0])}, in ${p.styles[0]} style`,
  },

  // === 9-slot templates ==================================================
  {
    slots: { adjective: 2, noun: 2, action: 1, setting: 1, extra: 2, atmosphere: 1 },
    build: (p) =>
      `${withArticle(p.adjectives[0])} ${p.nouns[0]} with ${p.extras[0]} and ${withArticle(p.adjectives[1])} ${p.nouns[1]} made of ${p.extras[1]}, ${p.actions[0]} together ${inSetting(p.settings[0])} ${duringAtmosphere(p.atmospheres[0])}`,
  },
  {
    slots: { adjective: 1, noun: 2, action: 2, setting: 1, extra: 2, atmosphere: 1 },
    build: (p) =>
      `${withArticle(p.adjectives[0])} ${p.nouns[0]} made of ${p.extras[0]}, ${p.actions[0]} and ${p.actions[1]} alongside ${withArticle(p.nouns[1])} covered in ${p.extras[1]} ${inSetting(p.settings[0])} ${duringAtmosphere(p.atmospheres[0])}`,
  },
  {
    slots: { adjective: 1, noun: 3, action: 1, setting: 1, extra: 2, atmosphere: 1 },
    build: (p) =>
      `${withArticle(p.adjectives[0])} ${p.nouns[0]} riding ${withArticle(p.nouns[1])} made of ${p.extras[0]}, chasing ${withArticle(p.nouns[2])} covered in ${p.extras[1]} while ${p.actions[0]} ${inSetting(p.settings[0])} ${duringAtmosphere(p.atmospheres[0])}`,
  },

  // === 8-slot templates ==================================================
  {
    slots: { adjective: 1, noun: 2, action: 1, setting: 1, extra: 1, atmosphere: 1, style: 1 },
    build: (p) =>
      `${withArticle(p.adjectives[0])} ${p.nouns[0]} and ${withArticle(p.nouns[1])} made of ${p.extras[0]}, ${p.actions[0]} together ${inSetting(p.settings[0])} ${duringAtmosphere(p.atmospheres[0])}, in ${p.styles[0]} style`,
  },
  {
    slots: { adjective: 2, noun: 1, action: 1, setting: 1, extra: 2, atmosphere: 1 },
    build: (p) =>
      `${withArticle(p.adjectives[0])} and ${p.adjectives[1]} ${p.nouns[0]} covered in ${p.extras[0]}, ${p.actions[0]} through ${withArticle(p.settings[0])} while surrounded by ${p.extras[1]} ${duringAtmosphere(p.atmospheres[0])}`,
  },
  {
    slots: { adjective: 1, noun: 2, action: 2, setting: 1, extra: 1, atmosphere: 1 },
    build: (p) =>
      `${withArticle(p.adjectives[0])} ${p.nouns[0]} ${p.actions[0]} and ${p.actions[1]} on top of ${withArticle(p.nouns[1])} made of ${p.extras[0]} ${inSetting(p.settings[0])} ${duringAtmosphere(p.atmospheres[0])}`,
  },

  // === 7-slot templates ==================================================
  {
    slots: { adjective: 1, noun: 2, action: 1, setting: 1, extra: 1, atmosphere: 1 },
    build: (p) =>
      `${withArticle(p.adjectives[0])} ${p.nouns[0]} riding ${withArticle(p.nouns[1])} made of ${p.extras[0]}, ${p.actions[0]} through ${withArticle(p.settings[0])} ${duringAtmosphere(p.atmospheres[0])}`,
  },
  {
    slots: { adjective: 1, noun: 1, action: 1, setting: 1, extra: 2, atmosphere: 1 },
    build: (p) =>
      `${withArticle(p.adjectives[0])} ${p.nouns[0]} with ${p.extras[0]}, ${p.actions[0]} on top of ${withArticle(p.extras[1])} ${inSetting(p.settings[0])} ${duringAtmosphere(p.atmospheres[0])}`,
  },

  // === 6-slot templates ==================================================
  {
    slots: { adjective: 1, noun: 2, action: 1, setting: 1, extra: 1 },
    build: (p) =>
      `${withArticle(p.adjectives[0])} ${p.nouns[0]} and ${withArticle(p.nouns[1])} made of ${p.extras[0]}, ${p.actions[0]} together ${inSetting(p.settings[0])}`,
  },
  {
    slots: { adjective: 1, noun: 1, action: 1, setting: 1, extra: 1, atmosphere: 1 },
    build: (p) =>
      `${withArticle(p.adjectives[0])} ${p.nouns[0]} made of ${p.extras[0]}, ${p.actions[0]} ${inSetting(p.settings[0])} ${duringAtmosphere(p.atmospheres[0])}`,
  },

  // === 5-slot fallbacks ==================================================
  {
    slots: { adjective: 1, noun: 1, action: 1, setting: 1, extra: 1 },
    build: (p) =>
      `${withArticle(p.adjectives[0])} ${p.nouns[0]} made of ${p.extras[0]}, ${p.actions[0]} ${inSetting(p.settings[0])}`,
  },
  {
    slots: { adjective: 1, noun: 1, action: 1, setting: 1, atmosphere: 1 },
    build: (p) =>
      `${withArticle(p.adjectives[0])} ${p.nouns[0]} ${p.actions[0]} ${inSetting(p.settings[0])} ${duringAtmosphere(p.atmospheres[0])}`,
  },
  {
    slots: { adjective: 1, noun: 1, action: 1, setting: 1 },
    build: (p) =>
      `${withArticle(p.adjectives[0])} ${p.nouns[0]} ${p.actions[0]} ${inSetting(p.settings[0])}`,
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
          WHEN last_used_at < NOW() - make_interval(mins => $2) THEN 1
          ELSE 2
        END AS usage_tier
      FROM word_bank
    )
    SELECT rw.*
    FROM ranked_words rw
    ORDER BY
      rw.usage_tier ASC,
      RANDOM()
    LIMIT $1
  `;

  try {
    const result = await pool.query<WordBankRow>(query, [count * 3, minutesCutoff]);

    if (result.rows.length === 0) {
      logger.warn("wordBankService", "No words found in word bank. Has seed been run?");
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
      logger.warn("wordBankService", `Requested ${count} words but only ${selected.length} available. Consider adding more words to the bank.`, {
        requested: count,
        available: selected.length,
      });
    }

    return selected.map(toWordBankEntry);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("wordBankService", "getRandomWords failed", { error: message });
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
  const atmospheres: string[] = [];

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
    } else if (ATMOSPHERE_CATEGORIES.has(cat)) {
      atmospheres.push(entry.word);
    } else if (EXTRA_CATEGORIES.has(cat)) {
      extras.push(entry.word);
    } else {
      extras.push(entry.word);
    }
  }

  // Score each template by how many of the available words it uses,
  // then pick the best-fitting one.
  let bestTemplate: PromptTemplate | null = null;
  let bestSlotCount = 0;

  for (const template of PROMPT_TEMPLATES) {
    const s = template.slots;
    const needAdj = s.adjective || 0;
    const needNoun = s.noun || 0;
    const needAction = s.action || 0;
    const needSetting = s.setting || 0;
    const needStyle = s.style || 0;
    const needExtra = s.extra || 0;
    const needAtmo = s.atmosphere || 0;

    if (
      adjectives.length >= needAdj &&
      nouns.length >= needNoun &&
      actions.length >= needAction &&
      settings.length >= needSetting &&
      styles.length >= needStyle &&
      extras.length >= needExtra &&
      atmospheres.length >= needAtmo
    ) {
      const totalSlots = needAdj + needNoun + needAction + needSetting + needStyle + needExtra + needAtmo;
      if (totalSlots > bestSlotCount) {
        bestSlotCount = totalSlots;
        bestTemplate = template;
      }
    }
  }

  if (bestTemplate) {
    const s = bestTemplate.slots;
    return bestTemplate.build({
      adjectives: adjectives.slice(0, s.adjective || 0),
      nouns: nouns.slice(0, s.noun || 0),
      actions: actions.slice(0, s.action || 0),
      settings: settings.slice(0, s.setting || 0),
      styles: styles.slice(0, s.style || 0),
      extras: extras.slice(0, s.extra || 0),
      atmospheres: atmospheres.slice(0, s.atmosphere || 0),
    });
  }

  // Fallback: build a grammatical sentence from whatever we have
  const parts: string[] = [];
  const adj = adjectives[0];
  const noun = nouns[0] || extras[0] || "creature";
  parts.push(adj ? `${withArticle(adj)} ${noun}` : `${withArticle(noun)}`);
  if (actions[0]) parts.push(actions[0]);
  if (settings[0]) parts.push(inSetting(settings[0]));
  if (extras.length > 0 && !parts[0].includes(extras[0])) {
    parts.push(`surrounded by ${extras[0]}`);
  }
  if (atmospheres[0]) parts.push(duringAtmosphere(atmospheres[0]));
  return parts.join(" ");
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
    logger.error("wordBankService", "markWordsUsed failed", { error: message });
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

/**
 * Get a balanced set of words for prompt generation.
 *
 * Guarantees at least one word from each core role (noun, adjective, action,
 * setting) so that prompt templates can always produce a full sentence. The
 * remaining slots are filled with random words from any category.
 *
 * @param total Total number of words to select (default: 6)
 * @returns Array of WordBankEntry objects with guaranteed diversity
 */
async function getBalancedWordsForPrompt(total: number = 10): Promise<WordBankEntry[]> {
  // Guarantee specific roles so templates can build rich sentences.
  // We pull 2 nouns, 2 adjectives, 2 extras to feed the largest templates.
  const requiredRoles = [
    { categories: Array.from(NOUN_CATEGORIES), role: "noun-1" },
    { categories: Array.from(NOUN_CATEGORIES), role: "noun-2" },
    { categories: ["adjectives", "emotions"], role: "adjective-1" },
    { categories: ["adjectives", "emotions"], role: "adjective-2" },
    { categories: ["actions"], role: "action" },
    { categories: ["settings"], role: "setting" },
    { categories: Array.from(EXTRA_CATEGORIES), role: "extra-1" },
    { categories: Array.from(EXTRA_CATEGORIES), role: "extra-2" },
    { categories: Array.from(ATMOSPHERE_CATEGORIES), role: "atmosphere" },
  ];

  const selected: WordBankEntry[] = [];
  const usedIds = new Set<number>();

  // Step 1: Pick one word per required role
  for (const req of requiredRoles) {
    const catList = req.categories.map((c) => `'${c}'`).join(", ");
    const result = await pool.query<WordBankRow>(
      `SELECT * FROM word_bank
       WHERE category IN (${catList})
       ORDER BY
         CASE WHEN last_used_at IS NULL THEN 0 ELSE 1 END,
         RANDOM()
       LIMIT 5`
    );

    const available = result.rows.filter((r) => !usedIds.has(r.id));
    if (available.length > 0) {
      const pick = available[0];
      selected.push(toWordBankEntry(pick));
      usedIds.add(pick.id);
    }
  }

  // Step 2: Fill remaining slots with random words from any category
  const remaining = total - selected.length;
  if (remaining > 0) {
    const excludeIds = Array.from(usedIds);
    const fillQuery = excludeIds.length > 0
      ? `SELECT * FROM word_bank WHERE id != ALL($2)
         ORDER BY CASE WHEN last_used_at IS NULL THEN 0 ELSE 1 END, RANDOM()
         LIMIT $1`
      : `SELECT * FROM word_bank
         ORDER BY CASE WHEN last_used_at IS NULL THEN 0 ELSE 1 END, RANDOM()
         LIMIT $1`;

    const fillResult = await pool.query<WordBankRow>(
      fillQuery,
      excludeIds.length > 0 ? [remaining, excludeIds] : [remaining]
    );

    for (const row of fillResult.rows) {
      if (!usedIds.has(row.id)) {
        selected.push(toWordBankEntry(row));
        usedIds.add(row.id);
      }
    }
  }

  return selected;
}

/**
 * Maximum number of retry attempts when variety validation rejects a combination.
 */
const MAX_VARIETY_RETRIES = 3;

/**
 * Get balanced words for prompt generation with anti-repetition validation.
 *
 * Wraps getBalancedWordsForPrompt with a retry loop that checks the proposed
 * word combination against recent rounds using the promptVarietyService. If
 * validation fails (too much overlap with a recent round), re-selects up to
 * MAX_VARIETY_RETRIES times. If all retries fail, returns the last selection
 * anyway to avoid blocking round creation.
 *
 * @param total Total number of words to select (default: 10)
 * @returns Array of WordBankEntry objects with guaranteed diversity
 */
async function getBalancedWordsWithVarietyCheck(
  total: number = 10
): Promise<WordBankEntry[]> {
  let lastSelection: WordBankEntry[] = [];

  for (let attempt = 1; attempt <= MAX_VARIETY_RETRIES; attempt++) {
    const words = await getBalancedWordsForPrompt(total);
    lastSelection = words;

    if (words.length === 0) {
      logger.warn("wordBankService", "No words returned from balanced selection, skipping variety check");
      return words;
    }

    const wordIds = words.map((w) => w.id);
    const validation = await promptVarietyService.validateCombination(wordIds);

    if (validation.valid) {
      if (attempt > 1) {
        logger.info("wordBankService", `Variety check passed on attempt ${attempt}`, {
          attempt,
          overlapRatio: validation.highestOverlapRatio,
        });
      }
      return words;
    }

    logger.warn("wordBankService", `Variety check failed on attempt ${attempt}/${MAX_VARIETY_RETRIES}. Retrying...`, {
      attempt,
      maxRetries: MAX_VARIETY_RETRIES,
      overlapRatio: validation.highestOverlapRatio,
      mostOverlappingRoundId: validation.mostOverlappingRoundId,
      overlappingWordCount: validation.overlappingWordCount,
    });
  }

  // All retries exhausted -- use the last selection to avoid blocking round creation
  logger.warn("wordBankService", `All ${MAX_VARIETY_RETRIES} variety check attempts exhausted. Proceeding with last selection.`, {
    maxRetries: MAX_VARIETY_RETRIES,
  });
  return lastSelection;
}

/**
 * Get words for a specific difficulty level.
 *
 * Reads DIFFICULTY_WORD_COUNTS from env config to determine how many words
 * the given difficulty level requires, then delegates to
 * getBalancedWordsWithVarietyCheck with that count.
 *
 * Falls back to 'normal' difficulty when an unrecognised difficulty string
 * is supplied.
 *
 * @param difficulty Difficulty name (e.g. "easy", "normal", "hard")
 * @returns Array of WordBankEntry objects sized for the requested difficulty
 */
async function getWordsForDifficulty(
  difficulty: string
): Promise<WordBankEntry[]> {
  const wordCounts = env.DIFFICULTY_WORD_COUNTS;
  const normalised = difficulty.toLowerCase();

  let count = wordCounts[normalised];

  if (count === undefined) {
    logger.warn(
      "wordBankService",
      `Unknown difficulty "${difficulty}", falling back to "normal"`,
      { requested: difficulty, available: Object.keys(wordCounts) }
    );
    count = wordCounts["normal"] ?? 7;
  }

  logger.info("wordBankService", `Selecting ${count} words for difficulty "${normalised}"`, {
    difficulty: normalised,
    wordCount: count,
  });

  return getBalancedWordsWithVarietyCheck(count);
}

export const wordBankService = {
  getRandomWords,
  getRandomSubset,
  getBalancedWordsForPrompt,
  getBalancedWordsWithVarietyCheck,
  getWordsForDifficulty,
  assemblePrompt,
  assemblePromptFromEntries,
  markWordsUsed,
  getWordCount,
  getAllWords,
  getWordsByCategory,
  getCategories,
};
