/**
 * ElementBreakdown -- collapsible word-level score breakdown.
 *
 * Displays after a guess is scored to show which prompt words were matched,
 * partially matched, or missed entirely. Includes a score bar with color
 * coding consistent with ScoreDisplay.
 *
 * Usage:
 *   <ElementBreakdown
 *     elementScores={{ matchedWords: ['cat'], partialMatches: [{ word: 'juggling', similarity: 0.72 }], elementScore: 65, overallScore: 58 }}
 *     promptWords={['cat', 'juggling', 'sunset']}
 *   />
 */

import { useState, useEffect } from 'react';
import type { ElementScoreBreakdown } from '../types/game';

interface ElementBreakdownProps {
  elementScores: ElementScoreBreakdown;
  promptWords?: string[];
}

function getScoreClass(score: number): string {
  if (score >= 80) return 'score-excellent';
  if (score >= 50) return 'score-good';
  if (score >= 25) return 'score-decent';
  return 'score-low';
}

function getScoreBarBgClass(score: number): string {
  if (score >= 80) return 'element-breakdown-bar-fill--excellent';
  if (score >= 50) return 'element-breakdown-bar-fill--good';
  if (score >= 25) return 'element-breakdown-bar-fill--decent';
  return 'element-breakdown-bar-fill--low';
}

/** Strip punctuation from a word so "birthday." matches "birthday". */
function stripPunctuation(word: string): string {
  return word.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

/** Stop words excluded from scoring — don't show as "missed". */
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'in', 'of', 'and', 'with', 'on', 'at', 'to',
  'for', 'is', 'it', 'by', 'as', 'or', 'be', 'was', 'are', 'from',
  'that', 'this', 'but', 'not', 'has', 'have', 'had', 'its', 'while',
]);

/**
 * Derive missed words: prompt words that are not in matchedWords or
 * partialMatches word list. Strips punctuation before comparing so
 * "birthday." matches "birthday". Filters out stop words since they
 * are excluded from scoring.
 */
function deriveMissedWords(
  promptWords: string[],
  matchedWords: string[],
  partialMatches: { word: string; similarity: number }[],
): string[] {
  const matchedSet = new Set(matchedWords.map((w) => stripPunctuation(w)));
  const partialSet = new Set(partialMatches.map((p) => stripPunctuation(p.word)));

  return promptWords.filter((w) => {
    const cleaned = stripPunctuation(w);
    if (cleaned.length === 0) return false;
    if (STOP_WORDS.has(cleaned)) return false;
    return !matchedSet.has(cleaned) && !partialSet.has(cleaned);
  });
}

/** Detect if the viewport is mobile-width (< 768px). */
function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < 768 : false,
  );

  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth < 768);
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return isMobile;
}

export default function ElementBreakdown({
  elementScores,
  promptWords,
}: ElementBreakdownProps) {
  const isMobile = useIsMobile();
  const [expanded, setExpanded] = useState(!isMobile);

  // Sync default expanded state if viewport changes
  useEffect(() => {
    setExpanded(!isMobile);
  }, [isMobile]);

  const { matchedWords, partialMatches, elementScore } = elementScores;

  const missedWords = promptWords
    ? deriveMissedWords(promptWords, matchedWords, partialMatches)
    : [];

  const scoreClass = getScoreClass(elementScore);
  const barFillClass = getScoreBarBgClass(elementScore);
  const clampedScore = Math.max(0, Math.min(100, elementScore));

  return (
    <div className="element-breakdown">
      <button
        type="button"
        className="element-breakdown-toggle"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        aria-controls="element-breakdown-content"
      >
        <span className="element-breakdown-toggle-label">Word Breakdown</span>
        <span
          className={`element-breakdown-toggle-icon${expanded ? ' element-breakdown-toggle-icon--open' : ''}`}
          aria-hidden="true"
        />
      </button>

      {expanded && (
        <div
          id="element-breakdown-content"
          className="element-breakdown-content"
          role="region"
          aria-label="Word breakdown details"
        >
          {/* Score bar */}
          <div className="element-breakdown-score-section">
            <div className="element-breakdown-score-header">
              <span className="element-breakdown-score-label">Element Score</span>
              <span className={`element-breakdown-score-value ${scoreClass}`}>
                {elementScore}
              </span>
            </div>
            <div className="element-breakdown-bar">
              <div
                className={`element-breakdown-bar-fill ${barFillClass}`}
                style={{ width: `${clampedScore}%` }}
                role="progressbar"
                aria-valuenow={elementScore}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Element score: ${elementScore} out of 100`}
              />
            </div>
          </div>

          {/* Matched words */}
          {matchedWords.length > 0 && (
            <div className="element-breakdown-group">
              <span className="element-breakdown-group-label">Matched</span>
              <div className="element-breakdown-pills">
                {matchedWords.map((word, i) => (
                  <span key={`${word}-${i}`} className="element-breakdown-pill element-breakdown-pill--matched">
                    <span className="element-breakdown-pill-check" aria-hidden="true">
                      &#10003;
                    </span>
                    {word}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Partial matches */}
          {partialMatches.length > 0 && (
            <div className="element-breakdown-group">
              <span className="element-breakdown-group-label">Partial</span>
              <div className="element-breakdown-pills">
                {partialMatches.map((pm, i) => (
                  <span
                    key={`${pm.word}-${i}`}
                    className="element-breakdown-pill element-breakdown-pill--partial"
                  >
                    {pm.word}
                    <span className="element-breakdown-pill-similarity">
                      {Math.round(pm.similarity * 100)}%
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Missed words */}
          {missedWords.length > 0 && (
            <div className="element-breakdown-group">
              <span className="element-breakdown-group-label">Missed</span>
              <div className="element-breakdown-pills">
                {missedWords.map((word, i) => (
                  <span key={`${word}-${i}`} className="element-breakdown-pill element-breakdown-pill--missed">
                    {word}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
