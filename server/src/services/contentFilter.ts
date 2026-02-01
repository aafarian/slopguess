/**
 * Content filter service.
 *
 * Provides simple blocked-term detection using word-boundary regex matching.
 * No external API dependency — runs entirely in-process.
 */

// ---------------------------------------------------------------------------
// Blocked terms list
// ---------------------------------------------------------------------------

/**
 * Widely recognized slurs and hate speech terms.
 * Word-boundary matching prevents false positives on substrings.
 */
const BLOCKED_TERMS: string[] = [
  // Racial / ethnic slurs
  "nigger",
  "nigga",
  "niggas",
  "chink",
  "gook",
  "spic",
  "spick",
  "wetback",
  "kike",
  "beaner",
  "coon",
  "darkie",
  "jigaboo",
  "raghead",
  "towelhead",
  "camel jockey",
  "paki",
  "wop",
  "dago",
  "gringo",
  "honky",
  "honkey",
  "cracker",
  "redskin",
  "injun",
  "chinaman",
  "zipperhead",
  "sandnigger",
  "pickaninny",
  "sambo",
  "Uncle Tom",

  // Homophobic / transphobic slurs
  "faggot",
  "fag",
  "dyke",
  "tranny",
  "shemale",
  "she-male",

  // Ableist slurs
  "retard",
  "retarded",

  // Misogynistic slurs
  "cunt",

  // General hate speech / extremism
  "white power",
  "white supremacy",
  "heil hitler",
  "sieg heil",
  "gas the jews",
  "kill all",
  "ethnic cleansing",
  "race war",
  "14 words",
  "1488",
];

// ---------------------------------------------------------------------------
// Pre-compiled regex cache
// ---------------------------------------------------------------------------

const blockedRegexes: { term: string; regex: RegExp }[] = BLOCKED_TERMS.map(
  (term) => ({
    term,
    regex: new RegExp(`\\b${escapeRegex(term)}\\b`, "i"),
  })
);

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns `true` if the text contains any blocked term.
 */
export function containsBlockedContent(text: string): boolean {
  const normalized = normalize(text);
  return blockedRegexes.some(({ regex }) => regex.test(normalized));
}

/**
 * Returns the first matched blocked term, or `null` if none found.
 * Useful for logging which term triggered the filter.
 */
export function getBlockedContentMatch(text: string): string | null {
  const normalized = normalize(text);
  for (const { term, regex } of blockedRegexes) {
    if (regex.test(normalized)) {
      return term;
    }
  }
  return null;
}
