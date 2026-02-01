/**
 * GuessForm -- reusable guess submission form with validation, loading states,
 * character count, and comprehensive error handling.
 *
 * Extracted from GamePage to keep that component focused on layout and state
 * management while this component owns the form UX.
 */

import { useState, useRef, useCallback } from 'react';
import { ApiRequestError } from '../services/api';
import { submitGuess } from '../services/game';
import type { GuessResult } from '../types/game';

const MAX_CHARS = 200;

interface GuessFormProps {
  roundId: string;
  onSuccess: (result: GuessResult) => void;
  onAlreadyGuessed: () => void;
  onRoundEnded: () => void;
  disabled?: boolean;
}

/** Map API error codes/statuses to user-friendly messages. */
function getErrorMessage(err: unknown): string {
  if (err instanceof ApiRequestError) {
    switch (err.status) {
      case 409:
        return "You've already submitted a guess for this round.";
      case 400:
        if (err.code === 'ROUND_NOT_ACTIVE') {
          return 'This round is no longer active.';
        }
        return err.message || 'Invalid request. Please check your guess and try again.';
      case 404:
        return 'Round not found. It may have been removed.';
      default:
        return err.message || 'Something went wrong. Please try again.';
    }
  }
  return 'Something went wrong. Please try again.';
}

export default function GuessForm({
  roundId,
  onSuccess,
  onAlreadyGuessed,
  onRoundEnded,
  disabled = false,
}: GuessFormProps) {
  const [guessText, setGuessText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const submittedRef = useRef(false); // double-submit prevention

  const charCount = guessText.length;
  const isNearLimit = charCount >= 180;
  const isAtLimit = charCount >= MAX_CHARS;
  const trimmedGuess = guessText.trim();
  const canSubmit = trimmedGuess.length > 0 && !submitting && !disabled && !submittedRef.current;

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!canSubmit) return;

      // Double-submit guard
      if (submittedRef.current) return;

      setSubmitting(true);
      setSubmitError(null);

      try {
        const result = await submitGuess(roundId, trimmedGuess);
        submittedRef.current = true;
        onSuccess(result);
      } catch (err) {
        const message = getErrorMessage(err);
        setSubmitError(message);

        // Handle specific cases with callbacks
        if (err instanceof ApiRequestError) {
          if (err.status === 409) {
            submittedRef.current = true;
            onAlreadyGuessed();
          } else if (err.status === 400 && err.code === 'ROUND_NOT_ACTIVE') {
            onRoundEnded();
          }
        }
      } finally {
        setSubmitting(false);
      }
    },
    [canSubmit, roundId, trimmedGuess, onSuccess, onAlreadyGuessed, onRoundEnded],
  );

  return (
    <form className="game-guess-form" onSubmit={handleSubmit}>
      <div className="form-group">
        <label htmlFor="guess-input">What prompt generated this image?</label>
        <div className="game-guess-input-wrapper">
          <input
            id="guess-input"
            type="text"
            className={`game-guess-input${submitError ? ' input-error' : ''}${submitting ? ' game-guess-input--disabled' : ''}`}
            placeholder="What do you think the prompt was?"
            value={guessText}
            onChange={(e) => {
              setGuessText(e.target.value);
              if (submitError) setSubmitError(null);
            }}
            maxLength={MAX_CHARS}
            disabled={submitting || disabled}
            autoComplete="off"
            aria-describedby="guess-char-count guess-error"
          />
        </div>
        <div className="game-guess-meta">
          <span
            id="guess-char-count"
            className={`game-guess-char-count${isAtLimit ? ' game-guess-char-count--limit' : isNearLimit ? ' game-guess-char-count--near' : ''}`}
          >
            {charCount}/{MAX_CHARS}
          </span>
        </div>
      </div>

      {submitError && (
        <div id="guess-error" className="game-guess-error" role="alert">
          {submitError}
        </div>
      )}

      <button
        type="submit"
        className={`btn btn-primary btn-block game-guess-submit${submitting ? ' game-guess-submit--loading' : ''}`}
        disabled={!canSubmit}
      >
        {submitting ? (
          <>
            <span className="game-guess-submit-spinner" aria-hidden="true" />
            Submitting...
          </>
        ) : (
          'Submit Guess'
        )}
      </button>
    </form>
  );
}
