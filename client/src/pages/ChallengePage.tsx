/**
 * ChallengePage -- challenge hub for viewing, managing, and creating challenges.
 *
 * Route: /challenges (requires authentication)
 *
 * Sections:
 *  1. Create Challenge -- select a friend, type a prompt, submit
 *  2. Incoming Challenges -- challenges where user is the challenged party
 *  3. Sent Challenges -- challenges the user has created
 *
 * Redirects unauthenticated users to a login CTA.
 */

import { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import {
  getIncomingChallenges,
  getSentChallenges,
  createChallenge,
  getFriends,
} from '../services/social';
import type { Challenge, Friendship } from '../types/social';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import EmptyState from '../components/EmptyState';

type Tab = 'incoming' | 'sent';

const MAX_PROMPT_CHARS = 200;

/** Format ISO date string to a short readable form. */
function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** Map challenge status to a display-friendly CSS modifier. */
function getStatusModifier(
  status: Challenge['status'],
): string {
  switch (status) {
    case 'active':
      return 'active';
    case 'guessed':
    case 'completed':
      return 'completed';
    case 'expired':
      return 'expired';
    case 'declined':
      return 'declined';
    default:
      return 'pending';
  }
}

export default function ChallengePage() {
  const { isAuthenticated, user } = useAuth();
  const [searchParams] = useSearchParams();

  // Tab state
  const [activeTab, setActiveTab] = useState<Tab>('incoming');

  // Challenge list state
  const [incoming, setIncoming] = useState<Challenge[]>([]);
  const [sent, setSent] = useState<Challenge[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState('');

  // Create challenge state
  const [friends, setFriends] = useState<Friendship[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(true);
  const [selectedFriendId, setSelectedFriendId] = useState('');
  const [promptText, setPromptText] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createSuccess, setCreateSuccess] = useState('');

  // Pre-fill friend from query parameter (?friendId=...)
  useEffect(() => {
    const prefillFriendId = searchParams.get('friendId');
    if (prefillFriendId) {
      setSelectedFriendId(prefillFriendId);
    }
  }, [searchParams]);

  // Fetch challenge lists
  const fetchChallenges = useCallback(async () => {
    setListLoading(true);
    setListError('');
    try {
      const [incomingRes, sentRes] = await Promise.all([
        getIncomingChallenges(),
        getSentChallenges(),
      ]);
      setIncoming(incomingRes.challenges);
      setSent(sentRes.challenges);
    } catch {
      setListError('Failed to load challenges.');
    } finally {
      setListLoading(false);
    }
  }, []);

  // Fetch friends for the create form
  const fetchFriends = useCallback(async () => {
    setFriendsLoading(true);
    try {
      const res = await getFriends();
      setFriends(res.friends);
    } catch {
      // Non-critical: create form will show a message
    } finally {
      setFriendsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetchChallenges();
      fetchFriends();
    }
  }, [isAuthenticated, fetchChallenges, fetchFriends]);

  // Create challenge handler
  const handleCreate = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedFriendId || !promptText.trim() || creating) return;

      setCreating(true);
      setCreateError('');
      setCreateSuccess('');

      try {
        await createChallenge(selectedFriendId, promptText.trim());
        setCreateSuccess('Challenge sent! Your friend will be notified once the image is ready.');
        setPromptText('');
        setSelectedFriendId('');
        // Refresh the sent list
        const sentRes = await getSentChallenges();
        setSent(sentRes.challenges);
      } catch (err) {
        setCreateError(
          err instanceof Error ? err.message : 'Failed to create challenge.',
        );
      } finally {
        setCreating(false);
      }
    },
    [selectedFriendId, promptText, creating],
  );

  // Unauthenticated CTA
  if (!isAuthenticated) {
    return (
      <div className="challenge-page">
        <div className="game-auth-cta">
          <p className="game-auth-cta-text">
            Sign in to challenge your friends and compete!
          </p>
          <div className="game-auth-cta-actions">
            <Link to="/login?returnTo=%2Fchallenges" className="btn btn-primary">
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

  const promptCharCount = promptText.length;
  const isNearLimit = promptCharCount >= 180;
  const isAtLimit = promptCharCount >= MAX_PROMPT_CHARS;
  const canCreate =
    selectedFriendId !== '' && promptText.trim().length > 0 && !creating;

  return (
    <div className="challenge-page">
      {/* Header */}
      <div className="challenge-header">
        <h1 className="challenge-title">Challenges</h1>
        {user && (
          <p className="challenge-subtitle">
            Challenge friends to guess your AI-generated images
          </p>
        )}
      </div>

      {/* ============================================================= */}
      {/* Create Challenge                                               */}
      {/* ============================================================= */}
      <section className="challenge-create-section">
        <h2 className="challenge-section-heading">Create Challenge</h2>

        {friendsLoading ? (
          <LoadingSpinner message="Loading friends..." />
        ) : friends.length === 0 ? (
          <div className="challenge-no-friends">
            <p className="challenge-no-friends-text">
              You need friends to create a challenge.{' '}
              <Link to="/friends">Find friends</Link> to get started.
            </p>
          </div>
        ) : (
          <form className="challenge-create-form" onSubmit={handleCreate}>
            <div className="form-group">
              <label htmlFor="challenge-friend-select">Challenge a friend</label>
              <select
                id="challenge-friend-select"
                className="challenge-select"
                value={selectedFriendId}
                onChange={(e) => setSelectedFriendId(e.target.value)}
                disabled={creating}
              >
                <option value="">Select a friend...</option>
                {friends.map((f) => (
                  <option key={f.friendId} value={f.friendId}>
                    {f.friendUsername}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="challenge-prompt-input">
                Write a prompt for the AI image
              </label>
              <input
                id="challenge-prompt-input"
                type="text"
                className="game-guess-input"
                placeholder="e.g. A cat riding a skateboard in space"
                value={promptText}
                onChange={(e) => {
                  setPromptText(e.target.value);
                  if (createError) setCreateError('');
                  if (createSuccess) setCreateSuccess('');
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

            {createError && (
              <div className="game-guess-error" role="alert">
                {createError}
              </div>
            )}

            {createSuccess && (
              <div className="challenge-create-success" role="status">
                {createSuccess}
              </div>
            )}

            <button
              type="submit"
              className={`btn btn-primary btn-block challenge-create-submit${creating ? ' game-guess-submit--loading' : ''}`}
              disabled={!canCreate}
            >
              {creating ? (
                <>
                  <span className="game-guess-submit-spinner" aria-hidden="true" />
                  Sending...
                </>
              ) : (
                'Send Challenge'
              )}
            </button>
          </form>
        )}
      </section>

      {/* ============================================================= */}
      {/* Challenge Lists (Tabs)                                         */}
      {/* ============================================================= */}
      <section className="challenge-lists-section">
        <div className="challenge-tabs">
          <button
            type="button"
            className={`challenge-tab${activeTab === 'incoming' ? ' challenge-tab--active' : ''}`}
            onClick={() => setActiveTab('incoming')}
          >
            Incoming
            {incoming.length > 0 && (
              <span className="challenge-tab-count">{incoming.length}</span>
            )}
          </button>
          <button
            type="button"
            className={`challenge-tab${activeTab === 'sent' ? ' challenge-tab--active' : ''}`}
            onClick={() => setActiveTab('sent')}
          >
            Sent
            {sent.length > 0 && (
              <span className="challenge-tab-count">{sent.length}</span>
            )}
          </button>
        </div>

        {listLoading && <LoadingSpinner message="Loading challenges..." />}

        {listError && (
          <ErrorMessage message={listError} onRetry={fetchChallenges} />
        )}

        {!listLoading && !listError && (
          <>
            {/* Incoming tab */}
            {activeTab === 'incoming' && (
              <div className="challenge-list">
                {incoming.length === 0 ? (
                  <EmptyState
                    title="No Incoming Challenges"
                    message="No one has challenged you yet. Challenge a friend to get started!"
                  />
                ) : (
                  <ul className="challenge-card-list">
                    {incoming.map((c) => (
                      <li key={c.id} className="challenge-card">
                        <div className="challenge-card-thumb-wrapper">
                          {c.imageUrl ? (
                            <img
                              className="challenge-card-thumb"
                              src={c.imageUrl}
                              alt="Challenge image"
                              loading="lazy"
                            />
                          ) : (
                            <div className="challenge-card-thumb challenge-card-thumb--placeholder" />
                          )}
                        </div>

                        <div className="challenge-card-details">
                          <span className="challenge-card-opponent">
                            From <strong>{c.challengerUsername}</strong>
                          </span>
                          <span className="challenge-card-date">
                            {formatDate(c.createdAt)}
                          </span>
                        </div>

                        <div className="challenge-card-actions">
                          {c.status === 'active' ? (
                            <Link
                              to={`/challenges/${c.id}`}
                              className="btn btn-sm btn-primary"
                            >
                              Guess
                            </Link>
                          ) : (
                            <Link
                              to={`/challenges/${c.id}`}
                              className="btn btn-sm btn-outline"
                            >
                              View
                            </Link>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Sent tab */}
            {activeTab === 'sent' && (
              <div className="challenge-list">
                {sent.length === 0 ? (
                  <EmptyState
                    title="No Sent Challenges"
                    message="You haven't sent any challenges yet. Create one above!"
                  />
                ) : (
                  <ul className="challenge-card-list">
                    {sent.map((c) => (
                      <li key={c.id} className="challenge-card">
                        <div className="challenge-card-thumb-wrapper">
                          {c.imageUrl ? (
                            <img
                              className="challenge-card-thumb"
                              src={c.imageUrl}
                              alt="Challenge image"
                              loading="lazy"
                            />
                          ) : (
                            <div className="challenge-card-thumb challenge-card-thumb--placeholder" />
                          )}
                        </div>

                        <div className="challenge-card-details">
                          <span className="challenge-card-opponent">
                            To <strong>{c.challengedUsername}</strong>
                          </span>
                          <span className="challenge-card-date">
                            {formatDate(c.createdAt)}
                          </span>
                        </div>

                        <div className="challenge-card-status">
                          <span
                            className={`challenge-status-badge challenge-status-badge--${getStatusModifier(c.status)}`}
                          >
                            {c.status}
                          </span>
                        </div>

                        <div className="challenge-card-actions">
                          <Link
                            to={`/challenges/${c.id}`}
                            className="btn btn-sm btn-outline"
                          >
                            View
                          </Link>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
