/**
 * StreakDisplay -- compact card showing user streak data with a 7-day calendar.
 *
 * Displays:
 *  - Current streak prominently with a flame icon
 *  - Longest streak as a secondary metric
 *  - 7-day calendar row: filled dots for played days, hollow for not played
 *
 * The component computes which of the last 7 days were played based on
 * `currentStreak` and `lastPlayedDate`. If the streak covers a day, the
 * corresponding dot is filled.
 *
 * Usage:
 *   <StreakDisplay
 *     currentStreak={5}
 *     longestStreak={12}
 *     lastPlayedDate="2026-01-31"
 *   />
 */

interface StreakDisplayProps {
  currentStreak: number;
  longestStreak: number;
  lastPlayedDate: string | null;
}

/**
 * Return an array of 7 booleans (index 0 = 6 days ago, index 6 = today)
 * indicating whether the user played on each day.
 *
 * Logic: if `lastPlayedDate` is provided and the streak is active, we mark
 * the most recent `currentStreak` days (up to 7) ending at `lastPlayedDate`
 * as played.
 */
function computeWeekPlayed(
  currentStreak: number,
  lastPlayedDate: string | null,
): boolean[] {
  const played = Array(7).fill(false) as boolean[];

  if (!lastPlayedDate || currentStreak <= 0) {
    return played;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const lastPlayed = new Date(lastPlayedDate + 'T00:00:00');
  lastPlayed.setHours(0, 0, 0, 0);

  // How many days ago was the last played date relative to today?
  const diffMs = today.getTime() - lastPlayed.getTime();
  const daysAgo = Math.round(diffMs / (1000 * 60 * 60 * 24));

  // If the last played date is in the future or more than 6 days ago,
  // we can still compute which dots fall within the streak window.
  // The 7-day row covers indices 0..6 where index 6 = today, index 0 = 6 days ago.
  // Day offset from today: index i represents (6 - i) days ago.
  for (let i = 0; i < 7; i++) {
    const dayOffset = 6 - i; // how many days ago this index represents
    // This day is "played" if it falls between (daysAgo - streak + 1) and daysAgo (inclusive).
    const streakStart = daysAgo; // most recent played day offset
    const streakEnd = daysAgo - currentStreak + 1; // earliest played day offset (can be negative)

    if (dayOffset <= streakStart && dayOffset >= streakEnd && dayOffset >= 0) {
      played[i] = true;
    }
  }

  return played;
}

/** Short day labels for the 7-day calendar (Mon, Tue, etc.) */
function getDayLabels(): string[] {
  const labels: string[] = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    labels.push(d.toLocaleDateString('en-US', { weekday: 'short' }).charAt(0));
  }
  return labels;
}

export default function StreakDisplay({
  currentStreak,
  longestStreak,
  lastPlayedDate,
}: StreakDisplayProps) {
  const weekPlayed = computeWeekPlayed(currentStreak, lastPlayedDate);
  const dayLabels = getDayLabels();

  return (
    <div className="streak-display">
      {/* Main streak metrics */}
      <div className="streak-display-metrics">
        <div className="streak-display-current">
          <span className="streak-display-flame" aria-hidden="true">
            {'\uD83D\uDD25'}
          </span>
          <div className="streak-display-current-info">
            <span className="streak-display-current-value">{currentStreak}</span>
            <span className="streak-display-current-label">
              {currentStreak === 1 ? 'Day Streak' : 'Day Streak'}
            </span>
          </div>
        </div>
        <div className="streak-display-longest">
          <span className="streak-display-longest-value">{longestStreak}</span>
          <span className="streak-display-longest-label">Longest Streak</span>
        </div>
      </div>

      {/* 7-day calendar row */}
      <div className="streak-display-calendar" role="img" aria-label={`Played ${weekPlayed.filter(Boolean).length} of 7 days`}>
        {weekPlayed.map((played, idx) => (
          <div key={idx} className="streak-display-day">
            <span className="streak-display-day-label">{dayLabels[idx]}</span>
            <span
              className={`streak-display-dot ${played ? 'streak-display-dot--filled' : 'streak-display-dot--hollow'}`}
              aria-label={played ? 'Played' : 'Not played'}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
