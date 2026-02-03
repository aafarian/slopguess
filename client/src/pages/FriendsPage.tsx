/**
 * FriendsPage -- manage friends, pending requests, and user search.
 *
 * Route: /friends (requires authentication)
 *
 * Tabs:
 *  1. Friends List   -- accepted friends with Challenge, Message, Remove actions
 *  2. Pending        -- incoming friend requests with Accept and Decline buttons
 *  3. Search Users   -- username search with Add Friend button (debounced 300ms)
 *
 * Redirects to /login if the user is not authenticated.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
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

type Tab = 'friends' | 'pending' | 'search';

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
  const [searchParams] = useSearchParams();

  // Active tab — default from ?tab= query param
  const initialTab = (searchParams.get('tab') as Tab) || 'friends';
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

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

  // Debounce timer ref
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  // Debounced search
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (activeTab !== 'search') return;

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
  }, [searchQuery, activeTab, executeSearch]);

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
      // Optimistically update the search result to show pending status
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
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="friends-page">
      {/* Header */}
      <div className="friends-header">
        <h1 className="friends-title">Friends</h1>
      </div>

      {/* Tabs */}
      <div className="friends-tabs">
        <button
          type="button"
          className={`friends-tab ${activeTab === 'friends' ? 'friends-tab--active' : ''}`}
          onClick={() => setActiveTab('friends')}
        >
          Friends{friends.length > 0 && ` (${friends.length})`}
        </button>
        <button
          type="button"
          className={`friends-tab ${activeTab === 'pending' ? 'friends-tab--active' : ''}`}
          onClick={() => setActiveTab('pending')}
        >
          Pending{(pending.length + sent.length) > 0 && ` (${pending.length + sent.length})`}
        </button>
        <button
          type="button"
          className={`friends-tab ${activeTab === 'search' ? 'friends-tab--active' : ''}`}
          onClick={() => setActiveTab('search')}
        >
          Search Users
        </button>
      </div>

      {/* ============================================================= */}
      {/* Tab: Friends List                                              */}
      {/* ============================================================= */}
      {activeTab === 'friends' && (
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
            <ul className="friends-list">
              {[...friends]
                .sort((a, b) =>
                  a.friendUsername.localeCompare(b.friendUsername, undefined, {
                    sensitivity: 'base',
                  })
                )
                .map((friend) => (
                <li key={friend.id} className="friends-list-item">
                  <Avatar username={friend.friendUsername} />
                  <div className="friends-list-item-info">
                    <span className="friends-list-item-username">
                      {friend.friendUsername}
                    </span>
                  </div>
                  <div className="friends-list-item-actions">
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      onClick={() =>
                        navigate(`/challenges?friendId=${friend.friendId}`)
                      }
                    >
                      Challenge
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      onClick={() =>
                        navigate(`/messages?userId=${friend.friendId}`)
                      }
                    >
                      Message
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline friends-btn-danger"
                      disabled={mutatingIds.has(friend.id)}
                      onClick={() => handleRemove(friend.id)}
                    >
                      {mutatingIds.has(friend.id) ? 'Removing...' : 'Remove'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ============================================================= */}
      {/* Tab: Pending Requests                                          */}
      {/* ============================================================= */}
      {activeTab === 'pending' && (
        <section className="friends-section">
          {pendingLoading && <LoadingSpinner message="Loading requests..." />}

          {pendingError && (
            <ErrorMessage message={pendingError} onRetry={fetchPending} />
          )}

          {!pendingLoading && !pendingError && pending.length === 0 && sent.length === 0 && (
            <EmptyState
              title="No pending requests"
              message="You don't have any pending friend requests right now."
            />
          )}

          {!pendingLoading && !pendingError && pending.length > 0 && (
            <>
              <h3 className="friends-section-label">Incoming</h3>
              <ul className="friends-list">
                {pending.map((req) => (
                  <li key={req.id} className="friends-list-item">
                    <Avatar username={req.friendUsername} />
                    <div className="friends-list-item-info">
                      <span className="friends-list-item-username">
                        {req.friendUsername}
                      </span>
                      <span className="friends-list-item-meta">
                        wants to be your friend
                      </span>
                    </div>
                    <div className="friends-list-item-actions">
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
                        className="btn btn-sm btn-outline friends-btn-danger"
                        disabled={mutatingIds.has(req.id)}
                        onClick={() => handleDecline(req.id)}
                      >
                        Decline
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}

          {!pendingLoading && !pendingError && sent.length > 0 && (
            <>
              <h3 className="friends-section-label">Sent</h3>
              <ul className="friends-list">
                {sent.map((req) => (
                  <li key={req.id} className="friends-list-item">
                    <Avatar username={req.friendUsername} />
                    <div className="friends-list-item-info">
                      <span className="friends-list-item-username">
                        {req.friendUsername}
                      </span>
                      <span className="friends-list-item-meta">
                        request sent
                      </span>
                    </div>
                    <div className="friends-list-item-actions">
                      <span className="friends-status-badge friends-status-badge--pending">
                        Pending
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {/* ============================================================= */}
      {/* Tab: Search Users                                              */}
      {/* ============================================================= */}
      {activeTab === 'search' && (
        <section className="friends-section">
          <div className="friends-search-input-wrapper">
            <input
              type="text"
              className="friends-search-input"
              placeholder="Search by username..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
            />
          </div>

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

          {!searchLoading && !searchError && searchResults.length > 0 && (
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
                    {user.friendshipStatus === 'declined' && (
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        disabled={mutatingIds.has(user.id)}
                        onClick={() => handleAddFriend(user.id)}
                      >
                        {mutatingIds.has(user.id) ? 'Adding...' : 'Add Friend'}
                      </button>
                    )}
                    {!user.friendshipStatus && (
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
          )}

          {!searchLoading && !searchError && !hasSearched && !searchQuery.trim() && (
            <EmptyState
              title="Find players"
              message="Type a username above to search for players and send friend requests."
            />
          )}
        </section>
      )}
    </div>
  );
}
