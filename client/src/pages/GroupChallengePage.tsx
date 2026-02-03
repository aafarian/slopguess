/**
 * GroupChallengePage -- list page for group challenges.
 *
 * Route: /group-challenges (requires authentication)
 *
 * Sections:
 *  1. "Create Group Challenge" button (opens creation modal)
 *  2. Active group challenges (pending/active/scoring) -- invitations at top
 *  3. Completed group challenges
 *
 * The creation flow is a 3-step inline form:
 *   Step 1: Select friends (multi-select, min 2, max 10)
 *   Step 2: Write a prompt
 *   Step 3: Submit
 */

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import {
  getGroupChallenges,
  createGroupChallenge,
  getFriends,
} from '../services/social';
import type { GroupChallenge, Friendship } from '../types/social';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import EmptyState from '../components/EmptyState';

const MAX_PROMPT_CHARS = 200;
const MIN_PARTICIPANTS = 2;
const MAX_PARTICIPANTS = 10;

/** Format ISO date string to a short readable form. */
function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** Map group challenge status to a display-friendly CSS modifier. */
function getStatusModifier(
  status: GroupChallenge['status'],
): string {
  switch (status) {
    case 'active':
    case 'scoring':
      return 'active';
    case 'completed':
      return 'completed';
    case 'expired':
      return 'expired';
    default:
      return 'pending';
  }
}

/** Display-friendly status label. */
function getStatusLabel(status: GroupChallenge['status']): string {
  switch (status) {
    case 'pending':
      return 'Generating...';
    case 'active':
      return 'Active';
    case 'scoring':
      return 'In Progress';
    case 'completed':
      return 'Completed';
    case 'expired':
      return 'Expired';
    default:
      return status;
  }
}

export default function GroupChallengePage() {
  const { isAuthenticated, user } = useAuth();

  // Challenge list state
  const [challenges, setChallenges] = useState<GroupChallenge[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState('');

  // Create modal state
  const [showCreate, setShowCreate] = useState(false);
  const [friends, setFriends] = useState<Friendship[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [selectedFriendIds, setSelectedFriendIds] = useState<Set<string>>(new Set());
  const [promptText, setPromptText] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createSuccess, setCreateSuccess] = useState('');

  // Fetch challenges
  const fetchChallenges = useCallback(async () => {
    setListLoading(true);
    setListError('');
    try {
      const res = await getGroupChallenges();
      setChallenges(res.groupChallenges);
    } catch {
      setListError('Failed to load group challenges.');
    } finally {
      setListLoading(false);
    }
  }, []);

  // Fetch friends for creation form
  const fetchFriends = useCallback(async () => {
    setFriendsLoading(true);
    try {
      const res = await getFriends();
      setFriends(res.friends);
    } catch {
      // Non-critical
    } finally {
      setFriendsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetchChallenges();
    }
  }, [isAuthenticated, fetchChallenges]);

  // Fetch friends when create form opens
  useEffect(() => {
    if (showCreate && isAuthenticated && friends.length === 0) {
      fetchFriends();
    }
  }, [showCreate, isAuthenticated, friends.length, fetchFriends]);

  // Toggle friend selection
  function toggleFriend(friendId: string) {
    setSelectedFriendIds((prev) => {
      const next = new Set(prev);
      if (next.has(friendId)) {
        next.delete(friendId);
      } else if (next.size < MAX_PARTICIPANTS) {
        next.add(friendId);
      }
      return next;
    });
  }

  // Create challenge handler
  const handleCreate = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (selectedFriendIds.size < MIN_PARTICIPANTS || !promptText.trim() || creating) return;

      setCreating(true);
      setCreateError('');
      setCreateSuccess('');

      try {
        await createGroupChallenge(
          Array.from(selectedFriendIds),
          promptText.trim(),
        );
        setCreateSuccess('Group challenge created! Your friends will be notified once the image is ready.');
        setPromptText('');
        setSelectedFriendIds(new Set());
        setShowCreate(false);
        // Refresh list
        const res = await getGroupChallenges();
        setChallenges(res.groupChallenges);
      } catch (err) {
        setCreateError(
          err instanceof Error ? err.message : 'Failed to create group challenge.',
        );
      } finally {
        setCreating(false);
      }
    },
    [selectedFriendIds, promptText, creating],
  );

  // Cancel create
  function handleCancelCreate() {
    setShowCreate(false);
    setSelectedFriendIds(new Set());
    setPromptText('');
    setCreateError('');
    setCreateSuccess('');
  }

  // Unauthenticated CTA
  if (!isAuthenticated) {
    return (
      <div className="gc-page">
        <div className="game-auth-cta">
          <p className="game-auth-cta-text">
            Sign in to create and join group challenges with friends!
          </p>
          <div className="game-auth-cta-actions">
            <Link to="/login?returnTo=%2Fgroup-challenges" className="btn btn-primary">
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

  // Split challenges into active vs completed
  const activeChallenges = challenges.filter(
    (c) => c.status === 'pending' || c.status === 'active' || c.status === 'scoring',
  );
  const completedChallenges = challenges.filter(
    (c) => c.status === 'completed' || c.status === 'expired',
  );

  const promptCharCount = promptText.length;
  const isNearLimit = promptCharCount >= 180;
  const isAtLimit = promptCharCount >= MAX_PROMPT_CHARS;
  const canCreate =
    selectedFriendIds.size >= MIN_PARTICIPANTS &&
    promptText.trim().length > 0 &&
    !creating;

  // Sort friends alphabetically for the selection list
  const sortedFriends = [...friends].sort((a, b) =>
    a.friendUsername.localeCompare(b.friendUsername, undefined, {
      sensitivity: 'base',
    }),
  );

  return (
    <div className="gc-page">
      {/* Header */}
      <div className="gc-header">
        <div className="gc-header-text">
          <h1 className="gc-title">Group Challenges</h1>
          {user && (
            <p className="gc-subtitle">
              Challenge a group of friends to guess your AI-generated image
            </p>
          )}
        </div>
        <button
          type="button"
          className="btn btn-primary gc-create-btn"
          onClick={() => setShowCreate(true)}
        >
          + Create Group Challenge
        </button>
      </div>

      {/* Success message */}
      {createSuccess && (
        <div className="gc-create-success" role="status">
          {createSuccess}
        </div>
      )}

      {/* ============================================================= */}
      {/* Create Group Challenge Modal                                   */}
      {/* ============================================================= */}
      {showCreate && (
        <div className="gc-create-overlay" onClick={handleCancelCreate}>
          <div
            className="gc-create-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="gc-create-modal-header">
              <h2 className="gc-create-modal-title">Create Group Challenge</h2>
              <button
                type="button"
                className="gc-create-modal-close"
                onClick={handleCancelCreate}
                aria-label="Close"
              >
                {'\u2715'}
              </button>
            </div>

            <form className="gc-create-form" onSubmit={handleCreate}>
              {/* Step 1: Select friends */}
              <div className="gc-create-step">
                <label className="gc-create-step-label">
                  1. Select friends ({selectedFriendIds.size}/{MAX_PARTICIPANTS}, min {MIN_PARTICIPANTS})
                </label>

                {friendsLoading ? (
                  <LoadingSpinner message="Loading friends..." />
                ) : friends.length < MIN_PARTICIPANTS ? (
                  <div className="gc-create-no-friends">
                    <p className="gc-create-no-friends-text">
                      You need at least {MIN_PARTICIPANTS} friends to create a group challenge.{' '}
                      <Link to="/friends">Find friends</Link> to get started.
                    </p>
                  </div>
                ) : (
                  <div className="gc-friend-select-list">
                    {sortedFriends.map((f) => {
                      const isSelected = selectedFriendIds.has(f.friendId);
                      const isDisabled = !isSelected && selectedFriendIds.size >= MAX_PARTICIPANTS;
                      return (
                        <button
                          key={f.friendId}
                          type="button"
                          className={`gc-friend-chip${isSelected ? ' gc-friend-chip--selected' : ''}${isDisabled ? ' gc-friend-chip--disabled' : ''}`}
                          onClick={() => !isDisabled && toggleFriend(f.friendId)}
                          disabled={isDisabled}
                        >
                          <span className="gc-friend-chip-initial" aria-hidden="true">
                            {f.friendUsername.charAt(0).toUpperCase()}
                          </span>
                          <span className="gc-friend-chip-name">{f.friendUsername}</span>
                          {isSelected && (
                            <span className="gc-friend-chip-check" aria-hidden="true">
                              {'\u2713'}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Step 2: Write prompt */}
              <div className="gc-create-step">
                <label htmlFor="gc-prompt-input" className="gc-create-step-label">
                  2. Write a prompt for the AI image
                </label>
                <input
                  id="gc-prompt-input"
                  type="text"
                  className="game-guess-input"
                  placeholder="e.g. A cat riding a skateboard in space"
                  value={promptText}
                  onChange={(e) => {
                    setPromptText(e.target.value);
                    if (createError) setCreateError('');
                  }}
                  maxLength={MAX_PROMPT_CHARS}
                  disabled={creating}
                  autoComplete="off"
                />
                <div className="game-guess-meta">
                  <span
                    className={`game-guess-char-count${isAtLimit ? ' game-guess-char-count--limit' : isNearLimit ? ' game-guess-char-count--near' : ''}`}
                  >
                    {promptCharCount}/{MAX_PROMPT_CHARS}
                  </span>
                </div>
              </div>

              {/* Error */}
              {createError && (
                <div className="game-guess-error" role="alert">
                  {createError}
                </div>
              )}

              {/* Step 3: Submit */}
              <div className="gc-create-actions">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={handleCancelCreate}
                  disabled={creating}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`btn btn-primary${creating ? ' game-guess-submit--loading' : ''}`}
                  disabled={!canCreate}
                >
                  {creating ? (
                    <>
                      <span className="game-guess-submit-spinner" aria-hidden="true" />
                      Creating...
                    </>
                  ) : (
                    'Create Challenge'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* Challenge Lists                                                */}
      {/* ============================================================= */}

      {listLoading && <LoadingSpinner message="Loading group challenges..." />}

      {listError && (
        <ErrorMessage message={listError} onRetry={fetchChallenges} />
      )}

      {!listLoading && !listError && challenges.length === 0 && (
        <EmptyState
          title="No Group Challenges Yet"
          message="Create your first group challenge or wait for a friend to invite you!"
        />
      )}

      {!listLoading && !listError && challenges.length > 0 && (
        <>
          {/* Active challenges */}
          {activeChallenges.length > 0 && (
            <section className="gc-section">
              <h2 className="gc-section-heading">
                Active ({activeChallenges.length})
              </h2>
              <ul className="gc-card-list">
                {activeChallenges.map((gc) => (
                  <li key={gc.id}>
                    <Link to={`/group-challenges/${gc.id}`} className="gc-card">
                      <div className="gc-card-thumb-wrapper">
                        {gc.imageUrl ? (
                          <img
                            className="gc-card-thumb"
                            src={gc.imageUrl}
                            alt="Challenge image"
                            loading="lazy"
                          />
                        ) : (
                          <div className="gc-card-thumb gc-card-thumb--placeholder" />
                        )}
                      </div>
                      <div className="gc-card-details">
                        <span className="gc-card-creator">
                          By <strong>{gc.creatorUsername}</strong>
                        </span>
                        {gc.prompt && (
                          <span className="gc-card-prompt">{gc.prompt}</span>
                        )}
                        <span className="gc-card-meta">
                          {gc.participants.length} participant{gc.participants.length !== 1 ? 's' : ''}
                          {' \u00B7 '}
                          {formatDate(gc.createdAt)}
                        </span>
                      </div>
                      <div className="gc-card-status">
                        <span
                          className={`gc-status-badge gc-status-badge--${getStatusModifier(gc.status)}`}
                        >
                          {getStatusLabel(gc.status)}
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Completed challenges */}
          {completedChallenges.length > 0 && (
            <section className="gc-section">
              <h2 className="gc-section-heading">
                Completed ({completedChallenges.length})
              </h2>
              <ul className="gc-card-list">
                {completedChallenges.map((gc) => (
                  <li key={gc.id}>
                    <Link to={`/group-challenges/${gc.id}`} className="gc-card">
                      <div className="gc-card-thumb-wrapper">
                        {gc.imageUrl ? (
                          <img
                            className="gc-card-thumb"
                            src={gc.imageUrl}
                            alt="Challenge image"
                            loading="lazy"
                          />
                        ) : (
                          <div className="gc-card-thumb gc-card-thumb--placeholder" />
                        )}
                      </div>
                      <div className="gc-card-details">
                        <span className="gc-card-creator">
                          By <strong>{gc.creatorUsername}</strong>
                        </span>
                        {gc.prompt && (
                          <span className="gc-card-prompt">{gc.prompt}</span>
                        )}
                        <span className="gc-card-meta">
                          {gc.participants.length} participant{gc.participants.length !== 1 ? 's' : ''}
                          {' \u00B7 '}
                          {formatDate(gc.createdAt)}
                        </span>
                      </div>
                      <div className="gc-card-status">
                        <span
                          className={`gc-status-badge gc-status-badge--${getStatusModifier(gc.status)}`}
                        >
                          {getStatusLabel(gc.status)}
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
