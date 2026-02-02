/**
 * Challenge model types.
 * Defines the database row shape and public shapes for 1v1 image challenges.
 *
 * A challenge is created when a user types a prompt, generates an AI image,
 * and sends it to a friend to guess. The friend submits a guess which is
 * scored via semantic similarity.
 */

/** Challenge lifecycle status. */
export type ChallengeStatus =
  | 'pending'
  | 'active'
  | 'guessed'
  | 'completed'
  | 'expired'
  | 'declined';

/** Full challenge row as stored in PostgreSQL. */
export interface ChallengeRow {
  id: string;
  challenger_id: string;
  challenged_id: string;
  prompt: string;
  image_url: string | null;
  prompt_embedding: number[] | null;
  challenger_score: number | null;
  challenged_score: number | null;
  challenged_guess: string | null;
  status: ChallengeStatus;
  created_at: Date;
  updated_at: Date;
}

/**
 * Public challenge returned by API responses.
 * The prompt is only included when the viewer is the challenger,
 * or when the challenge status is 'guessed' or 'completed'.
 * The prompt_embedding is never exposed publicly.
 */
export interface PublicChallenge {
  id: string;
  challengerId: string;
  challengedId: string;
  challengerUsername: string;
  challengedUsername: string;
  imageUrl: string | null;
  challengerScore: number | null;
  challengedScore: number | null;
  challengedGuess: string | null;
  status: ChallengeStatus;
  createdAt: string;
  prompt?: string;
}

/**
 * Convert a ChallengeRow to a PublicChallenge.
 * Requires both usernames to be provided (from joins or separate lookups).
 *
 * @param row - The database row
 * @param challengerUsername - The challenger's display name
 * @param challengedUsername - The challenged user's display name
 * @param viewerUserId - The ID of the user viewing this challenge,
 *   used to determine whether the prompt should be included.
 *   The prompt is visible to the challenger always, and to the
 *   challenged user only after the challenge is guessed or completed.
 */
export function toPublicChallenge(
  row: ChallengeRow,
  challengerUsername: string,
  challengedUsername: string,
  viewerUserId: string,
): PublicChallenge {
  const isChallenger = viewerUserId === row.challenger_id;
  const isRevealed = row.status === 'guessed' || row.status === 'completed';
  const showPrompt = isChallenger || isRevealed;

  const result: PublicChallenge = {
    id: row.id,
    challengerId: row.challenger_id,
    challengedId: row.challenged_id,
    challengerUsername,
    challengedUsername,
    imageUrl: row.image_url,
    challengerScore: row.challenger_score,
    challengedScore: row.challenged_score,
    challengedGuess: row.challenged_guess,
    status: row.status,
    createdAt: row.created_at instanceof Date
      ? row.created_at.toISOString()
      : String(row.created_at),
  };

  if (showPrompt) {
    result.prompt = row.prompt;
  }

  return result;
}
