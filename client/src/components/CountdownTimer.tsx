import { useState, useEffect, useRef } from 'react';

interface CountdownTimerProps {
  targetDate: string;
  /** Called once when the countdown reaches zero. */
  onExpired?: () => void;
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return '';

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

export default function CountdownTimer({ targetDate, onExpired }: CountdownTimerProps) {
  const [remaining, setRemaining] = useState(() => new Date(targetDate).getTime() - Date.now());
  const firedRef = useRef(false);

  useEffect(() => {
    // Reset fired flag when targetDate changes (new round)
    firedRef.current = false;
    setRemaining(new Date(targetDate).getTime() - Date.now());

    const id = setInterval(() => {
      const r = new Date(targetDate).getTime() - Date.now();
      setRemaining(r);

      if (r <= 0 && !firedRef.current) {
        firedRef.current = true;
        onExpired?.();
      }
    }, 1000);

    return () => clearInterval(id);
  }, [targetDate, onExpired]);

  if (remaining <= 0) {
    return <span className="countdown-timer countdown-timer--done">Rotating soon...</span>;
  }

  return (
    <span className="countdown-timer">
      Next round in <strong>{formatRemaining(remaining)}</strong>
    </span>
  );
}
