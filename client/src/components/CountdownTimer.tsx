import { useState, useEffect } from 'react';

interface CountdownTimerProps {
  targetDate: string;
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

export default function CountdownTimer({ targetDate }: CountdownTimerProps) {
  const [remaining, setRemaining] = useState(() => new Date(targetDate).getTime() - Date.now());

  useEffect(() => {
    setRemaining(new Date(targetDate).getTime() - Date.now());

    const id = setInterval(() => {
      setRemaining(new Date(targetDate).getTime() - Date.now());
    }, 1000);

    return () => clearInterval(id);
  }, [targetDate]);

  if (remaining <= 0) {
    return <span className="countdown-timer countdown-timer--done">Rotating soon...</span>;
  }

  return (
    <span className="countdown-timer">
      Next round in <strong>{formatRemaining(remaining)}</strong>
    </span>
  );
}
