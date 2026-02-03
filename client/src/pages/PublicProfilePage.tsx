/**
 * PublicProfilePage -- public-facing user profile.
 *
 * Route: /u/:username (no authentication required)
 *
 * Sections:
 *  1. Header -- username, level badge, member since date
 *  2. Stats grid -- games played, average score, best score, current streak
 *  3. Recent achievements -- up to 5 most recent unlocked achievements
 *  4. Contextual action -- Challenge (if friend), Add Friend (if not), or "This is you"
 *
 * When the viewer is authenticated the API includes friendship status,
 * which enables the contextual action buttons.
 */

import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getPublicProfile, sendFriendRequest, searchUsers } from '../services/social';
import type { PublicProfile } from '../types/social';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import EmptyState from '../components/EmptyState';

/* -----------------------------------------------------------------------
   Score color helper -- matches ScoreDisplay color coding
   ----------------------------------------------------------------------- */

function getScoreColorClass(score: number | null): string {
  if (score === null) return '';
  if (score >= 80) return 'score-excellent';
  if (score >= 50) return 'score-good';
  if (score >= 25) return 'score-decent';
  return 'score-low';
}

/* -----------------------------------------------------------------------
   Date formatting helper
   ----------------------------------------------------------------------- */

function formatMemberSince(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
  });
}

/* -----------------------------------------------------------------------
   Component
   ----------------------------------------------------------------------- */

export default function PublicProfilePage() {
  const { username } = useParams<{ username: string }>();
  const { user, isAuthenticated } = useAuth();

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);

  // Friend request state
  const [friendRequestSent, setFriendRequestSent] = useState(false);
  const [friendRequestLoading, setFriendRequestLoading] = useState(false);
  const [friendRequestError, setFriendRequestError] = useState('');

  const isOwnProfile = isAuthenticated && user?.username === username;

  const fetchProfile = useCallback(async () => {
    if (!username) return;
    setLoading(true);
    setError('');
    setNotFound(false);
    try {
      const res = await getPublicProfile(username);
      setProfile(res.profile);
    } catch (err: unknown) {
      const apiErr = err as { status?: number };
      if (apiErr.status === 404) {
        setNotFound(true);
      } else {
        setError('Failed to load profile.');
      }
    } finally {
      setLoading(false);
    }
  }, [username]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  /* ----- Friend request handler ---------------------------------------- */

  async function handleAddFriend() {
    if (!profile || !isAuthenticated || !user) return;
    setFriendRequestLoading(true);
    setFriendRequestError('');
    try {
      // The friend request endpoint accepts a userId. Use the search
      // API to resolve the username to an id, then send the request.
      const searchRes = await searchUsers(profile.username);
      const targetUser = searchRes.users.find(
        (u) => u.username.toLowerCase() === profile.username.toLowerCase(),
      );
      if (!targetUser) {
        setFriendRequestError('Could not find user.');
        return;
      }
      await sendFriendRequest(targetUser.id);
      setFriendRequestSent(true);
    } catch {
      setFriendRequestError('Failed to send friend request.');
    } finally {
      setFriendRequestLoading(false);
    }
  }

  /* ----- Loading state ------------------------------------------------- */

  if (loading) {
    return (
      <div className="public-profile-page">
        <LoadingSpinner message="Loading profile..." />
      </div>
    );
  }

  /* ----- Not found state ----------------------------------------------- */

  if (notFound) {
    return (
      <div className="public-profile-page">
        <EmptyState
          title="User not found"
          message={`No player with the username "${username}" exists.`}
        />
        <div className="public-profile-page__back">
          <Link to="/" className="btn btn-outline">
            Back to Game
          </Link>
        </div>
      </div>
    );
  }

  /* ----- Error state --------------------------------------------------- */

  if (error) {
    return (
      <div className="public-profile-page">
        <ErrorMessage message={error} onRetry={fetchProfile} />
      </div>
    );
  }

  /* ----- Profile loaded ------------------------------------------------ */

  if (!profile) return null;

  return (
    <div className="public-profile-page">
      {/* ============================================================= */}
      {/* Header                                                        */}
      {/* ============================================================= */}
      <header className="public-profile-page__header">
        <div className="public-profile-page__avatar">
          {profile.username.charAt(0).toUpperCase()}
        </div>
        <div className="public-profile-page__identity">
          <h1 className="public-profile-page__username">{profile.username}</h1>
          <span className="public-profile-page__level-badge">
            Level {profile.level}
          </span>
        </div>
        <p className="public-profile-page__member-since">
          Member since {formatMemberSince(profile.createdAt)}
        </p>
      </header>

      {/* ============================================================= */}
      {/* Stats Grid                                                    */}
      {/* ============================================================= */}
      <section className="public-profile-page__stats">
        <h2 className="public-profile-page__section-heading">Stats</h2>
        <div className="public-profile-page__stats-grid">
          <div className="public-profile-page__stat-card">
            <span className="public-profile-page__stat-icon">&#127918;</span>
            <span className="public-profile-page__stat-value">
              {profile.stats.totalGamesPlayed}
            </span>
            <span className="public-profile-page__stat-label">Games Played</span>
          </div>

          <div className="public-profile-page__stat-card">
            <span className="public-profile-page__stat-icon">&#9878;</span>
            <span
              className={`public-profile-page__stat-value ${getScoreColorClass(profile.stats.averageScore)}`}
            >
              {profile.stats.averageScore.toFixed(1)}
            </span>
            <span className="public-profile-page__stat-label">Average Score</span>
          </div>

          <div className="public-profile-page__stat-card">
            <span className="public-profile-page__stat-icon">&#9733;</span>
            <span
              className={`public-profile-page__stat-value ${getScoreColorClass(profile.stats.bestScore)}`}
            >
              {profile.stats.bestScore}
            </span>
            <span className="public-profile-page__stat-label">Best Score</span>
          </div>

          <div className="public-profile-page__stat-card">
            <span className="public-profile-page__stat-icon">&#128293;</span>
            <span className="public-profile-page__stat-value">
              {profile.currentStreak}
            </span>
            <span className="public-profile-page__stat-label">Current Streak</span>
          </div>
        </div>
      </section>

      {/* ============================================================= */}
      {/* Recent Achievements                                           */}
      {/* ============================================================= */}
      <section className="public-profile-page__achievements">
        <h2 className="public-profile-page__section-heading">Recent Achievements</h2>

        {profile.recentAchievements.length === 0 ? (
          <EmptyState message="No achievements unlocked yet." />
        ) : (
          <ul className="public-profile-page__achievement-list">
            {profile.recentAchievements.map((ach) => (
              <li key={ach.id} className="public-profile-page__achievement-item">
                <span className="public-profile-page__achievement-icon">
                  {ach.icon}
                </span>
                <div className="public-profile-page__achievement-info">
                  <span className="public-profile-page__achievement-title">
                    {ach.title}
                  </span>
                  <span className="public-profile-page__achievement-desc">
                    {ach.description}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ============================================================= */}
      {/* Contextual Actions                                            */}
      {/* ============================================================= */}
      <section className="public-profile-page__actions">
        {isOwnProfile && (
          <Link to="/profile" className="btn btn-outline">
            Go to Your Dashboard
          </Link>
        )}

        {isAuthenticated && !isOwnProfile && profile.isFriend && (
          <Link to="/challenges" className="btn btn-primary">
            Challenge {profile.username}
          </Link>
        )}

        {isAuthenticated && !isOwnProfile && !profile.isFriend && !friendRequestSent && (
          <>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleAddFriend}
              disabled={friendRequestLoading}
            >
              {friendRequestLoading ? 'Sending...' : 'Add Friend'}
            </button>
            {friendRequestError && (
              <p className="public-profile-page__action-error">
                {friendRequestError}
              </p>
            )}
          </>
        )}

        {isAuthenticated && !isOwnProfile && !profile.isFriend && friendRequestSent && (
          <p className="public-profile-page__action-success">
            Friend request sent!
          </p>
        )}

        {!isAuthenticated && (
          <Link to="/login" className="btn btn-outline">
            Log in to add friend
          </Link>
        )}
      </section>
    </div>
  );
}
