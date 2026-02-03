/**
 * FriendsPage -- single-page layout for managing friends.
 *
 * Route: /friends (requires authentication)
 *
 * Layout (top to bottom):
 *  - Search bar (always visible) -- type to search users, results appear inline
 *  - Pending requests section   -- notification-style cards (when any exist)
 *  - Friends list               -- Challenge button + overflow menu (Message, Remove)
 *
 * Redirects to /login if the user is not authenticated.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import {
  getFriends,
  getPendingRequests,
  getSentRequests,
  searchUsers,
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  removeFriend,
} from '../services/social';
import type { Friendship, UserSearchResult } from '../types/social';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import EmptyState from '../components/EmptyState';

const DEBOUNCE_MS = 300;

// -------------------------------------------------------------------------
// Avatar helpers
// -------------------------------------------------------------------------

const AVATAR_COLORS = [
  '#6C63FF', // indigo
  '#FF6584', // rose
  '#43B88C', // teal
  '#F9A826', // amber
  '#5B8DEF', // blue
  '#E85D75', // crimson
  '#36B5A0', // mint
  '#D97CF6', // violet
  '#EF8354', // coral
  '#47C9AF', // aqua
];

/** Simple string hash (djb2) mapped to AVATAR_COLORS index. */
function avatarColor(username: string): string {
  let hash = 5381;
  for (let i = 0; i < username.length; i++) {
    hash = (hash * 33) ^ username.charCodeAt(i);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function Avatar({ username }: { username: string }) {
  const initial = username.charAt(0).toUpperCase();
  return (
    <span
      className="friends-avatar"
      style={{ backgroundColor: avatarColor(username) }}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}

export default function FriendsPage() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  // Friends list state
  const [friends, setFriends] = useState<Friendship[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(true);
  const [friendsError, setFriendsError] = useState('');

  // Pending requests state (incoming + sent)
  const [pending, setPending] = useState<Friendship[]>([]);
  const [sent, setSent] = useState<Friendship[]>([]);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [pendingError, setPendingError] = useState('');

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [hasSearched, setHasSearched] = useState(false);

  // Mutation loading states
  const [mutatingIds, setMutatingIds] = useState<Set<string>>(new Set());

  // Confirmation dialog state -- only one at a time
  const [confirmingRemoveId, setConfirmingRemoveId] = useState<string | null>(null);

  // Overflow menu state -- which friend's menu is open
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Debounce timer ref
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Whether search is active (non-empty query)
  const isSearchActive = searchQuery.trim().length > 0;

  // -----------------------------------------------------------------------
  // Fetch helpers
  // -----------------------------------------------------------------------

  const fetchFriends = useCallback(async () => {
    setFriendsLoading(true);
    setFriendsError('');
    try {
      const res = await getFriends();
      setFriends(res.friends);
    } catch {
      setFriendsError('Failed to load friends.');
    } finally {
      setFriendsLoading(false);
    }
  }, []);

  const fetchPending = useCallback(async () => {
    setPendingLoading(true);
    setPendingError('');
    try {
      const [incomingRes, sentRes] = await Promise.all([
        getPendingRequests(),
        getSentRequests(),
      ]);
      setPending(incomingRes.requests);
      setSent(sentRes.requests);
    } catch {
      setPendingError('Failed to load pending requests.');
    } finally {
      setPendingLoading(false);
    }
  }, []);

  const executeSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      setHasSearched(false);
      return;
    }
    setSearchLoading(true);
    setSearchError('');
    try {
      const res = await searchUsers(query.trim());
      setSearchResults(res.users);
      setHasSearched(true);
    } catch {
      setSearchError('Failed to search users.');
    } finally {
      setSearchLoading(false);
    }
  }, []);

  // -----------------------------------------------------------------------
  // Initial fetch on mount
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (isAuthenticated) {
      fetchFriends();
      fetchPending();
    }
  }, [isAuthenticated, fetchFriends, fetchPending]);

  // -----------------------------------------------------------------------
  // Debounced search (fires whenever searchQuery changes)
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (!searchQuery.trim()) {
      setSearchResults([]);
      setHasSearched(false);
      setSearchLoading(false);
      return;
    }

    debounceRef.current = setTimeout(() => {
      executeSearch(searchQuery);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [searchQuery, executeSearch]);

  // -----------------------------------------------------------------------
  // Close overflow menu when clicking outside
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (!openMenuId) return;

    function handleClick() {
      setOpenMenuId(null);
    }

    // Delay listener so the current click doesn't immediately close
    const id = setTimeout(() => {
      document.addEventListener('click', handleClick);
    }, 0);

    return () => {
      clearTimeout(id);
      document.removeEventListener('click', handleClick);
    };
  }, [openMenuId]);

  // -----------------------------------------------------------------------
  // Redirect when not authenticated
  // -----------------------------------------------------------------------

  if (!isAuthenticated) {
    return (
      <div className="friends-page">
        <div className="game-auth-cta">
          <p className="game-auth-cta-text">
            Sign in to manage your friends and send challenges.
          </p>
          <div className="game-auth-cta-actions">
            <Link to="/login?returnTo=%2Ffriends" className="btn btn-primary">
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

  // -----------------------------------------------------------------------
  // Mutation helpers with loading feedback
  // -----------------------------------------------------------------------

  function addMutating(id: string) {
    setMutatingIds((prev) => new Set(prev).add(id));
  }

  function removeMutating(id: string) {
    setMutatingIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  async function handleAccept(friendshipId: string) {
    addMutating(friendshipId);
    try {
      await acceptFriendRequest(friendshipId);
      await Promise.all([fetchFriends(), fetchPending()]);
    } catch {
      // Error will be visible on refetch
    } finally {
      removeMutating(friendshipId);
    }
  }

  async function handleDecline(friendshipId: string) {
    addMutating(friendshipId);
    try {
      await declineFriendRequest(friendshipId);
      await fetchPending();
    } catch {
      // Error will be visible on refetch
    } finally {
      removeMutating(friendshipId);
    }
  }

  async function handleRemove(friendshipId: string) {
    addMutating(friendshipId);
    setOpenMenuId(null);
    try {
      await removeFriend(friendshipId);
      await fetchFriends();
    } catch {
      // Error will be visible on refetch
    } finally {
      removeMutating(friendshipId);
    }
  }

  async function handleAddFriend(userId: string) {
    addMutating(userId);
    try {
      await sendFriendRequest(userId);
      setSearchResults((prev) =>
        prev.map((u) =>
          u.id === userId ? { ...u, friendshipStatus: 'pending' } : u
        )
      );
      await fetchPending();
    } catch {
      // Error will be visible on refetch
    } finally {
      removeMutating(userId);
    }
  }

  // -----------------------------------------------------------------------
  // Sorted friends list
  // -----------------------------------------------------------------------

  const sortedFriends = [...friends].sort((a, b) =>
    a.friendUsername.localeCompare(b.friendUsername, undefined, {
      sensitivity: 'base',
    })
  );

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="friends-page">
      {/* Header */}
      <div className="friends-header">
        <h1 className="friends-title">Friends</h1>
      </div>

      {/* Search bar -- always visible */}
      <div className="friends-search-input-wrapper">
        <span className="friends-search-icon" aria-hidden="true">{'\u{1F50D}'}</span>
        <input
          type="text"
          className="friends-search-input"
          placeholder="Search for players..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button
            type="button"
            className="friends-search-clear"
            aria-label="Clear search"
            onClick={() => {
              setSearchQuery('');
              setSearchResults([]);
              setHasSearched(false);
            }}
          >
            {'\u2715'}
          </button>
        )}
      </div>

      {/* ============================================================= */}
      {/* Search results (shown when query is non-empty)                 */}
      {/* ============================================================= */}
      {isSearchActive && (
        <section className="friends-section">
          {searchLoading && <LoadingSpinner message="Searching..." />}

          {searchError && (
            <ErrorMessage
              message={searchError}
              onRetry={() => executeSearch(searchQuery)}
            />
          )}

          {!searchLoading && !searchError && hasSearched && searchResults.length === 0 && (
            <EmptyState
              title="No users found"
              message={`No users matching "${searchQuery}" were found. Try a different search.`}
            />
          )}

          {!searchLoading && !searchError && hasSearched && searchResults.length > 0 && (
            <>
              <div className="friends-search-result-count">
                {searchResults.length} user{searchResults.length !== 1 ? 's' : ''} found
              </div>
              <ul className="friends-list">
                {searchResults.map((user) => (
                  <li key={user.id} className="friends-list-item">
                    <Avatar username={user.username} />
                    <div className="friends-list-item-info">
                      <span className="friends-list-item-username">
                        {user.username}
                      </span>
                    </div>
                    <div className="friends-list-item-actions">
                      {user.friendshipStatus === 'accepted' && (
                        <span className="friends-status-badge friends-status-badge--accepted">
                          Friends
                        </span>
                      )}
                      {user.friendshipStatus === 'pending' && (
                        <span className="friends-status-badge friends-status-badge--pending">
                          Pending
                        </span>
                      )}
                      {(user.friendshipStatus === 'declined' || !user.friendshipStatus) && (
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          disabled={mutatingIds.has(user.id)}
                          onClick={() => handleAddFriend(user.id)}
                        >
                          {mutatingIds.has(user.id) ? 'Adding...' : 'Add Friend'}
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {/* ============================================================= */}
      {/* Default view (no search query): Pending + Friends              */}
      {/* ============================================================= */}
      {!isSearchActive && (
        <>
          {/* --- Pending requests section -------------------------------- */}
          {pendingLoading && <LoadingSpinner message="Loading requests..." />}

          {pendingError && (
            <ErrorMessage message={pendingError} onRetry={fetchPending} />
          )}

          {!pendingLoading && !pendingError && pending.length > 0 && (
            <section className="friends-pending-section">
              <h2 className="friends-section-header">
                {pending.length} friend request{pending.length !== 1 ? 's' : ''}
              </h2>
              <div className="friends-pending-cards">
                {pending.map((req) => (
                  <div key={req.id} className="friends-pending-card">
                    <Avatar username={req.friendUsername} />
                    <div className="friends-pending-card-info">
                      <span className="friends-pending-card-username">
                        {req.friendUsername}
                      </span>
                      <span className="friends-pending-card-meta">
                        wants to be your friend
                      </span>
                    </div>
                    <div className="friends-pending-card-actions">
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        disabled={mutatingIds.has(req.id)}
                        onClick={() => handleAccept(req.id)}
                      >
                        {mutatingIds.has(req.id) ? 'Accepting...' : 'Accept'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline"
                        disabled={mutatingIds.has(req.id)}
                        onClick={() => handleDecline(req.id)}
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Sent requests -- subtle note */}
          {!pendingLoading && !pendingError && sent.length > 0 && (
            <div className="friends-sent-note">
              {sent.length} request{sent.length !== 1 ? 's' : ''} sent
            </div>
          )}

          {/* --- Friends list section ----------------------------------- */}
          <section className="friends-section">
            {friendsLoading && <LoadingSpinner message="Loading friends..." />}

            {friendsError && (
              <ErrorMessage message={friendsError} onRetry={fetchFriends} />
            )}

            {!friendsLoading && !friendsError && friends.length === 0 && (
              <EmptyState
                title="No friends yet"
                message="Search for users to add them as friends and start playing together!"
              />
            )}

            {!friendsLoading && !friendsError && friends.length > 0 && (
              <>
                <h2 className="friends-section-header">
                  Friends ({friends.length})
                </h2>
                <ul className="friends-list">
                  {sortedFriends.map((friend) => (
                    <li
                      key={friend.id}
                      className={`friends-list-item${confirmingRemoveId === friend.id ? ' friends-list-item--confirming' : ''}`}
                    >
                      <Avatar username={friend.friendUsername} />
                      <div className="friends-list-item-info">
                        <span className="friends-list-item-username">
                          {friend.friendUsername}
                        </span>
                      </div>
                      <div className="friends-list-item-actions">
                        {confirmingRemoveId === friend.id ? (
                          <>
                            <span className="friends-confirm-label">
                              Remove {friend.friendUsername}?
                            </span>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline"
                              onClick={() => setConfirmingRemoveId(null)}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-outline friends-btn-danger"
                              disabled={mutatingIds.has(friend.id)}
                              onClick={() => {
                                handleRemove(friend.id);
                                setConfirmingRemoveId(null);
                              }}
                            >
                              {mutatingIds.has(friend.id) ? 'Removing...' : 'Confirm'}
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="btn btn-sm btn-primary"
                              onClick={() =>
                                navigate(`/challenges?friendId=${friend.friendId}`)
                              }
                            >
                              Challenge
                            </button>
                            <div className="friends-overflow-wrapper">
                              <button
                                type="button"
                                className="friends-overflow-btn"
                                aria-label={`More actions for ${friend.friendUsername}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenMenuId(openMenuId === friend.id ? null : friend.id);
                                }}
                              >
                                &middot;&middot;&middot;
                              </button>
                              {openMenuId === friend.id && (
                                <div className="friends-overflow-menu" onClick={(e) => e.stopPropagation()}>
                                  <button
                                    type="button"
                                    className="friends-overflow-menu-item"
                                    onClick={() => {
                                      setOpenMenuId(null);
                                      navigate(`/messages?userId=${friend.friendId}`);
                                    }}
                                  >
                                    Message
                                  </button>
                                  <button
                                    type="button"
                                    className="friends-overflow-menu-item friends-overflow-menu-item--danger"
                                    onClick={() => {
                                      setOpenMenuId(null);
                                      setConfirmingRemoveId(friend.id);
                                    }}
                                  >
                                    Remove
                                  </button>
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
