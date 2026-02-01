/**
 * Word bank model types.
 * Defines the database row shape and related interfaces for the word bank system.
 */

/** Full word_bank row as stored in PostgreSQL. */
export interface WordBankRow {
  id: number;
  word: string;
  category: string;
  last_used_at: Date | null;
  created_at: Date;
}

/** A word entry returned by service methods. */
export interface WordBankEntry {
  id: number;
  word: string;
  category: string;
  lastUsedAt: Date | null;
  createdAt: Date;
}

/** Seed data shape: a word and its category. */
export interface WordSeedEntry {
  word: string;
  category: string;
}

/** Convert a database row to a WordBankEntry. */
export function toWordBankEntry(row: WordBankRow): WordBankEntry {
  return {
    id: row.id,
    word: row.word,
    category: row.category,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
  };
}
