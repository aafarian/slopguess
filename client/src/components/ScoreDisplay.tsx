/**
 * ScoreDisplay -- animated score reveal with color coding and rank.
 *
 * Displays:
 *  - Large score number that counts up from 0 to the final score
 *  - Color-coded by score range (green/yellow/orange/red)
 *  - Descriptive label ("Excellent!", "Good", "Decent", "Keep trying")
 *  - Rank position ("Rank #3 of 15")
 *
 * Usage:
 *   <ScoreDisplay score={85} rank={3} totalGuesses={15} />
 */

import { useEffect, useRef, useState } from 'react';

interface ScoreDisplayProps {
  score: number;
  rank: number;
  totalGuesses: number;
}

function getScoreClass(score: number): string {
  if (score >= 80) return 'score-excellent';
  if (score >= 50) return 'score-good';
  if (score >= 25) return 'score-decent';
  return 'score-low';
}

function getScoreLabel(score: number): string {
  if (score >= 80) return 'Excellent!';
  if (score >= 50) return 'Good';
  if (score >= 25) return 'Decent';
  return 'Keep trying';
}

function getPercentileMessage(rank: number, totalGuesses: number): { text: string; encouragement: string } | null {
  if (totalGuesses <= 1) return null;
  const percentile = Math.round(((totalGuesses - rank) / totalGuesses) * 100);
  let encouragement: string;
  if (percentile >= 90) encouragement = 'Amazing!';
  else if (percentile >= 75) encouragement = 'Well done!';
  else if (percentile >= 50) encouragement = 'Not bad!';
  else encouragement = 'Keep it up!';
  return { text: `You beat ${percentile}% of players!`, encouragement };
}

const ANIMATION_DURATION_MS = 1000;

export default function ScoreDisplay({ score, rank, totalGuesses }: ScoreDisplayProps) {
  const [displayScore, setDisplayScore] = useState(0);
  const [animationDone, setAnimationDone] = useState(false);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    // Reset state when score changes
    setDisplayScore(0);
    setAnimationDone(false);
    startTimeRef.current = null;

    function animate(timestamp: number) {
      if (startTimeRef.current === null) {
        startTimeRef.current = timestamp;
      }

      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / ANIMATION_DURATION_MS, 1);

      // Ease-out cubic for a satisfying deceleration
      const eased = 1 - Math.pow(1 - progress, 3);
      const currentValue = Math.round(eased * score);

      setDisplayScore(currentValue);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        setDisplayScore(score);
        setAnimationDone(true);
      }
    }

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [score]);

  const scoreClass = getScoreClass(score);

  return (
    <div className={`score-display ${animationDone ? 'score-display--revealed' : ''}`}>
      <div className={`score-display-number ${scoreClass}`}>
        {displayScore}
      </div>
      <div className={`score-display-label ${scoreClass}`}>
        {animationDone ? getScoreLabel(score) : '\u00A0'}
      </div>
      <div className="score-display-rank">
        Rank #{rank} of {totalGuesses}
      </div>
      {animationDone && (
        <div className="score-display-percentile">
          {totalGuesses === 1 ? (
            <span className="score-display-percentile-text">
              You're the first to guess!
            </span>
          ) : (
            (() => {
              const msg = getPercentileMessage(rank, totalGuesses);
              return msg ? (
                <>
                  <span className="score-display-percentile-text">{msg.text}</span>
                  <span className="score-display-percentile-encouragement">{msg.encouragement}</span>
                </>
              ) : null;
            })()
          )}
        </div>
      )}
    </div>
  );
}
