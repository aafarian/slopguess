/**
 * AchievementsPage -- displays all achievements grouped by category.
 *
 * Route: /achievements (requires authentication)
 *
 * Shows:
 *  - Progress header: "X/14 unlocked"
 *  - Achievement cards grouped by category (Score, Streak, Social, Volume)
 *  - Unlocked achievements in full color; locked ones are dimmed
 */

import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { fetchAchievements } from '../services/achievements';
import type { Achievement, AchievementCategory } from '../types/achievement';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';

/** Display order and labels for achievement categories. */
const CATEGORY_CONFIG: { key: AchievementCategory; label: string }[] = [
  { key: 'score', label: 'Score' },
  { key: 'streak', label: 'Streak' },
  { key: 'social', label: 'Social' },
  { key: 'volume', label: 'Volume' },
];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function AchievementsPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [total, setTotal] = useState(0);
  const [unlocked, setUnlocked] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadAchievements = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchAchievements();
      setAchievements(res.achievements);
      setTotal(res.total);
      setUnlocked(res.unlocked);
    } catch {
      setError('Failed to load achievements.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      loadAchievements();
    }
  }, [isAuthenticated, loadAchievements]);

  // Group achievements by category
  const grouped = CATEGORY_CONFIG.map(({ key, label }) => ({
    category: key,
    label,
    items: achievements.filter((a) => a.category === key),
  })).filter((g) => g.items.length > 0);

  // Auth loading
  if (authLoading) {
    return (
      <div className="achievements-page">
        <LoadingSpinner message="Checking authentication..." />
      </div>
    );
  }

  // Not authenticated
  if (!isAuthenticated) {
    return (
      <div className="achievements-page">
        <div className="game-auth-cta">
          <p className="game-auth-cta-text">
            Sign in to view your achievements and track your progress.
          </p>
          <div className="game-auth-cta-actions">
            <Link to="/login?returnTo=%2Fachievements" className="btn btn-primary">
              Log In
            </Link>
            <Link to="/register" className="btn btn-outline">
              Register
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="achievements-page">
      {/* Header */}
      <div className="achievements-header">
        <h1 className="achievements-title">Achievements</h1>
        {!loading && !error && (
          <span className="achievements-progress">
            {unlocked}/{total} unlocked
          </span>
        )}
      </div>

      {/* Progress bar */}
      {!loading && !error && total > 0 && (
        <div className="achievements-progress-bar">
          <div
            className="achievements-progress-fill"
            style={{ width: `${(unlocked / total) * 100}%` }}
          />
        </div>
      )}

      {/* Loading */}
      {loading && <LoadingSpinner message="Loading achievements..." />}

      {/* Error */}
      {error && <ErrorMessage message={error} onRetry={loadAchievements} />}

      {/* Achievement groups */}
      {!loading && !error && grouped.map((group) => (
        <section key={group.category} className="achievements-category">
          <h2 className="achievements-category-heading">{group.label}</h2>
          <div className="achievements-grid">
            {group.items.map((achievement) => {
              const isUnlocked = achievement.unlockedAt !== null;
              return (
                <div
                  key={achievement.id}
                  className={`achievement-card ${isUnlocked ? 'achievement-card--unlocked' : 'achievement-card--locked'}`}
                >
                  <span className="achievement-card-icon" aria-hidden="true">
                    {achievement.icon}
                  </span>
                  <div className="achievement-card-info">
                    <span className="achievement-card-title">{achievement.title}</span>
                    <span className="achievement-card-desc">{achievement.description}</span>
                    {isUnlocked && achievement.unlockedAt && (
                      <span className="achievement-card-date">
                        Unlocked {formatDate(achievement.unlockedAt)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
