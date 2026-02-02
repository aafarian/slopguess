/**
 * Round model types.
 * Defines the database row shape and public shapes for game rounds.
 *
 * A round represents a single game round where an AI-generated image is shown
 * and players try to guess the prompt that was used to generate it.
 */

/** Round lifecycle status. */
export type RoundStatus = 'pending' | 'active' | 'completed';

/** Prompt source — tracks whether LLM or template generated the prompt. */
export type PromptSource = 'llm' | 'template';

/** Full round row as stored in PostgreSQL. */
export interface RoundRow {
  id: string;
  prompt: string;
  image_url: string | null;
  status: RoundStatus;
  prompt_embedding: number[] | null;
  prompt_source: PromptSource | null;
  difficulty: string | null;
  word_count: number | null;
  started_at: Date | null;
  ended_at: Date | null;
  created_at: Date;
}

/** CamelCase round for application use. */
export interface Round {
  id: string;
  prompt: string;
  imageUrl: string | null;
  status: RoundStatus;
  promptEmbedding: number[] | null;
  promptSource: PromptSource;
  difficulty: string;
  wordCount: number | null;
  startedAt: Date | null;
  endedAt: Date | null;
  createdAt: Date;
}

/**
 * Public round returned by API responses for active rounds.
 * The prompt is NOT included because it is the secret players are guessing.
 */
export interface PublicRound {
  id: string;
  imageUrl: string | null;
  status: RoundStatus;
  difficulty: string;
  wordCount: number | null;
  startedAt: string | null;
  endedAt: string | null;
}

/**
 * Public round returned after a round is completed.
 * The prompt is revealed once the round ends.
 */
export interface CompletedRound extends PublicRound {
  prompt: string;
  difficulty: string;
  promptSource: PromptSource;
}

/** Convert a database row to a Round. */
export function toRound(row: RoundRow): Round {
  return {
    id: row.id,
    prompt: row.prompt,
    imageUrl: row.image_url,
    status: row.status,
    promptEmbedding: row.prompt_embedding,
    promptSource: row.prompt_source ?? 'template',
    difficulty: row.difficulty ?? 'normal',
    wordCount: row.word_count ?? null,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    createdAt: row.created_at,
  };
}

/** Convert a Round to a PublicRound (hides prompt and embedding). */
export function toPublicRound(round: Round): PublicRound {
  return {
    id: round.id,
    imageUrl: round.imageUrl,
    status: round.status,
    difficulty: round.difficulty,
    wordCount: round.wordCount,
    startedAt: round.startedAt ? round.startedAt.toISOString() : null,
    endedAt: round.endedAt ? round.endedAt.toISOString() : null,
  };
}

/** Convert a completed Round to a CompletedRound (reveals prompt). */
export function toCompletedRound(round: Round): CompletedRound {
  return {
    ...toPublicRound(round),
    prompt: round.prompt,
    difficulty: round.difficulty,
    promptSource: round.promptSource,
  };
}
