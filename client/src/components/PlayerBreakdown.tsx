/**
 * PlayerBreakdown -- player-facing collapsible word-level score breakdown.
 *
 * A stripped-down version of ElementBreakdown that shows only matched words
 * (green pills with checkmark) and partial matches (yellow pills with
 * similarity %). The "Missed" section is intentionally omitted so players
 * cannot reverse-engineer the original prompt.
 *
 * Reuses all CSS classes from ElementBreakdown (no new styles needed).
 *
 * Usage:
 *   <PlayerBreakdown
 *     elementScores={{ matchedWords: ['cat'], partialMatches: [{ word: 'juggling', similarity: 0.72 }], elementScore: 65, overallScore: 58 }}
 *   />
 */

import { useState, useEffect } from 'react';
import type { ElementScoreBreakdown } from '../types/game';

interface PlayerBreakdownProps {
  elementScores: ElementScoreBreakdown;
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

export default function PlayerBreakdown({
  elementScores,
}: PlayerBreakdownProps) {
  const isMobile = useIsMobile();
  const [expanded, setExpanded] = useState(!isMobile);

  // Sync default expanded state if viewport changes
  useEffect(() => {
    setExpanded(!isMobile);
  }, [isMobile]);

  const { matchedWords, partialMatches, elementScore } = elementScores;

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
        aria-controls="player-breakdown-content"
      >
        <span className="element-breakdown-toggle-label">Your Word Matches</span>
        <span
          className={`element-breakdown-toggle-icon${expanded ? ' element-breakdown-toggle-icon--open' : ''}`}
          aria-hidden="true"
        />
      </button>

      {expanded && (
        <div
          id="player-breakdown-content"
          className="element-breakdown-content"
          role="region"
          aria-label="Your word matches details"
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
                {matchedWords.map((word) => (
                  <span key={word} className="element-breakdown-pill element-breakdown-pill--matched">
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
                {partialMatches.map((pm) => (
                  <span
                    key={pm.word}
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
        </div>
      )}
    </div>
  );
}
