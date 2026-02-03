/**
 * Social service — typed wrappers around the /api/friends, /api/challenges,
 * /api/messages, and /api/notifications endpoints.
 */

import { request } from './api';
import type {
  Friendship,
  Challenge,
  Message,
  FriendsListResponse,
  PendingRequestsResponse,
  UserSearchResponse,
  ChallengeListResponse,
  ChallengeDetailResponse,
  ChallengeGuessResponse,
  ChallengeHistoryResponse,
  ConversationListResponse,
  ConversationResponse,
  NotificationsResponse,
  UnreadCountResponse,
  PublicProfileResponse,
  ActivityFeedResponse,
  GroupChallengeListResponse,
  GroupChallengeDetailResponse,
  GroupChallengeCreateResponse,
  GroupChallengeJoinResponse,
  GroupChallengeGuessResponse,
  GroupChallengeDeclineResponse,
} from '../types/social';

// ---------------------------------------------------------------------------
// Public Profile
// ---------------------------------------------------------------------------

/**
 * Fetch a user's public profile by username.
 * Does not require authentication, but sends the token if available
 * (the backend uses optionalAuth to include friendship status).
 *
 * GET /api/users/:username/profile
 */
export async function getPublicProfile(
  username: string,
): Promise<PublicProfileResponse> {
  return request<PublicProfileResponse>(`/api/users/${encodeURIComponent(username)}/profile`);
}

// ---------------------------------------------------------------------------
// Friends
// ---------------------------------------------------------------------------

/**
 * Send a friend request to another user.
 * Requires authentication.
 *
 * POST /api/friends/request
 */
export async function sendFriendRequest(
  userId: string,
): Promise<{ friendship: Friendship }> {
  return request<{ friendship: Friendship }>('/api/friends/request', {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
}

/**
 * Accept a pending friend request.
 * Requires authentication.
 *
 * POST /api/friends/:friendshipId/accept
 */
export async function acceptFriendRequest(
  friendshipId: string,
): Promise<{ friendship: Friendship }> {
  return request<{ friendship: Friendship }>(
    `/api/friends/${friendshipId}/accept`,
    { method: 'POST' },
  );
}

/**
 * Decline a pending friend request.
 * Requires authentication.
 *
 * POST /api/friends/:friendshipId/decline
 */
export async function declineFriendRequest(
  friendshipId: string,
): Promise<{ friendship: Friendship }> {
  return request<{ friendship: Friendship }>(
    `/api/friends/${friendshipId}/decline`,
    { method: 'POST' },
  );
}

/**
 * Remove an existing friend.
 * Requires authentication.
 *
 * DELETE /api/friends/:friendshipId
 */
export async function removeFriend(
  friendshipId: string,
): Promise<{ message: string }> {
  return request<{ message: string }>(`/api/friends/${friendshipId}`, {
    method: 'DELETE',
  });
}

/**
 * List all accepted friends.
 * Requires authentication.
 *
 * GET /api/friends
 */
export async function getFriends(): Promise<FriendsListResponse> {
  return request<FriendsListResponse>('/api/friends');
}

/**
 * List pending received friend requests.
 * Requires authentication.
 *
 * GET /api/friends/requests
 */
export async function getPendingRequests(): Promise<PendingRequestsResponse> {
  return request<PendingRequestsResponse>('/api/friends/requests');
}

/**
 * Get pending friend requests sent by the current user (outgoing).
 * Requires authentication.
 *
 * GET /api/friends/sent
 */
export async function getSentRequests(): Promise<PendingRequestsResponse> {
  return request<PendingRequestsResponse>('/api/friends/sent');
}

/**
 * Search users by username prefix.
 * Requires authentication.
 *
 * GET /api/friends/search?q=query
 */
export async function searchUsers(query: string): Promise<UserSearchResponse> {
  const params = new URLSearchParams();
  params.set('q', query);
  return request<UserSearchResponse>(`/api/friends/search?${params.toString()}`);
}

// ---------------------------------------------------------------------------
// Challenges
// ---------------------------------------------------------------------------

/**
 * Create a new challenge with a friend.
 * Requires authentication.
 *
 * POST /api/challenges
 */
export async function createChallenge(
  friendId: string,
  prompt: string,
): Promise<{ challenge: Challenge }> {
  return request<{ challenge: Challenge }>('/api/challenges', {
    method: 'POST',
    body: JSON.stringify({ friendId, prompt }),
  });
}

/**
 * List pending incoming challenges (where user is the challenged party).
 * Requires authentication.
 *
 * GET /api/challenges/incoming
 */
export async function getIncomingChallenges(): Promise<ChallengeListResponse> {
  return request<ChallengeListResponse>('/api/challenges/incoming');
}

/**
 * List challenges the user has sent.
 * Requires authentication.
 *
 * GET /api/challenges/sent
 */
export async function getSentChallenges(): Promise<ChallengeListResponse> {
  return request<ChallengeListResponse>('/api/challenges/sent');
}

/**
 * Get details of a specific challenge.
 * Requires authentication.
 *
 * GET /api/challenges/:challengeId
 */
export async function getChallengeDetail(
  challengeId: string,
): Promise<ChallengeDetailResponse> {
  return request<ChallengeDetailResponse>(`/api/challenges/${challengeId}`);
}

/**
 * Submit a guess for a challenge.
 * Requires authentication.
 *
 * POST /api/challenges/:challengeId/guess
 */
export async function submitChallengeGuess(
  challengeId: string,
  guess: string,
): Promise<ChallengeGuessResponse> {
  return request<ChallengeGuessResponse>(
    `/api/challenges/${challengeId}/guess`,
    {
      method: 'POST',
      body: JSON.stringify({ guess }),
    },
  );
}

/**
 * Decline a challenge.
 * Requires authentication.
 *
 * POST /api/challenges/:challengeId/decline
 */
export async function declineChallenge(
  challengeId: string,
): Promise<{ challenge: Challenge }> {
  return request<{ challenge: Challenge }>(
    `/api/challenges/${challengeId}/decline`,
    { method: 'POST' },
  );
}

/**
 * Fetch paginated challenge history with a specific friend.
 * Requires authentication.
 *
 * GET /api/challenges/history/:friendId
 */
export async function getChallengeHistory(
  friendId: string,
  page?: number,
  limit?: number,
): Promise<ChallengeHistoryResponse> {
  const params = new URLSearchParams();
  if (page !== undefined) params.set('page', String(page));
  if (limit !== undefined) params.set('limit', String(limit));

  const query = params.toString();
  const url = `/api/challenges/history/${friendId}${query ? `?${query}` : ''}`;
  return request<ChallengeHistoryResponse>(url);
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

/**
 * Send a message to another user.
 * Requires authentication.
 *
 * POST /api/messages
 */
export async function sendMessage(
  receiverId: string,
  content: string,
): Promise<{ message: Message }> {
  return request<{ message: Message }>('/api/messages', {
    method: 'POST',
    body: JSON.stringify({ receiverId, content }),
  });
}

/**
 * List all conversations with latest message and unread count.
 * Requires authentication.
 *
 * GET /api/messages/conversations
 */
export async function getConversations(): Promise<ConversationListResponse> {
  return request<ConversationListResponse>('/api/messages/conversations');
}

/**
 * Get paginated conversation with a specific user.
 * Requires authentication.
 *
 * GET /api/messages/:userId
 */
export async function getConversation(
  userId: string,
  page?: number,
  limit?: number,
): Promise<ConversationResponse> {
  const params = new URLSearchParams();
  if (page !== undefined) params.set('page', String(page));
  if (limit !== undefined) params.set('limit', String(limit));

  const query = params.toString();
  const url = `/api/messages/${userId}${query ? `?${query}` : ''}`;
  return request<ConversationResponse>(url);
}

/**
 * Mark a message as read.
 * Requires authentication.
 *
 * PATCH /api/messages/:messageId/read
 */
export async function markMessageRead(
  messageId: string,
): Promise<{ message: Message }> {
  return request<{ message: Message }>(`/api/messages/${messageId}/read`, {
    method: 'PATCH',
  });
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

/**
 * Get user's notifications sorted by newest first.
 * Requires authentication.
 *
 * GET /api/notifications
 */
export async function getNotifications(): Promise<NotificationsResponse> {
  return request<NotificationsResponse>('/api/notifications');
}

/**
 * Get the count of unread notifications.
 * Requires authentication.
 *
 * GET /api/notifications/unread-count
 */
export async function getUnreadNotificationCount(): Promise<UnreadCountResponse> {
  return request<UnreadCountResponse>('/api/notifications/unread-count');
}

/**
 * Mark a notification as read.
 * Requires authentication.
 *
 * PATCH /api/notifications/:notificationId/read
 */
export async function markNotificationRead(
  notificationId: string,
): Promise<{ message: string }> {
  return request<{ message: string }>(
    `/api/notifications/${notificationId}/read`,
    { method: 'PATCH' },
  );
}

// ---------------------------------------------------------------------------
// Activity Feed
// ---------------------------------------------------------------------------

/**
 * Get the friend activity feed (events from accepted friends).
 * Requires authentication.
 *
 * GET /api/activity/feed?limit=N&offset=N
 */
export async function getFriendFeed(
  limit: number = 20,
  offset: number = 0,
): Promise<ActivityFeedResponse> {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  return request<ActivityFeedResponse>(`/api/activity/feed?${params.toString()}`);
}

/**
 * Get activity events for a specific user.
 * Does not require authentication (optionalAuth on server).
 *
 * GET /api/activity/user/:username?limit=N&offset=N
 */
export async function getUserActivity(
  username: string,
  limit: number = 20,
  offset: number = 0,
): Promise<ActivityFeedResponse> {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  return request<ActivityFeedResponse>(
    `/api/activity/user/${encodeURIComponent(username)}?${params.toString()}`,
  );
}

// ---------------------------------------------------------------------------
// Group Challenges
// ---------------------------------------------------------------------------

/**
 * Create a new group challenge.
 * Requires authentication.
 *
 * POST /api/group-challenges
 */
export async function createGroupChallenge(
  participantIds: string[],
  prompt: string,
): Promise<GroupChallengeCreateResponse> {
  return request<GroupChallengeCreateResponse>('/api/group-challenges', {
    method: 'POST',
    body: JSON.stringify({ participantIds, prompt }),
  });
}

/**
 * List group challenges for the authenticated user.
 * Requires authentication.
 *
 * GET /api/group-challenges
 */
export async function getGroupChallenges(): Promise<GroupChallengeListResponse> {
  return request<GroupChallengeListResponse>('/api/group-challenges');
}

/**
 * Get details of a specific group challenge.
 * Requires authentication.
 *
 * GET /api/group-challenges/:challengeId
 */
export async function getGroupChallengeDetail(
  challengeId: string,
): Promise<GroupChallengeDetailResponse> {
  return request<GroupChallengeDetailResponse>(
    `/api/group-challenges/${challengeId}`,
  );
}

/**
 * Join a group challenge.
 * Requires authentication.
 *
 * POST /api/group-challenges/:challengeId/join
 */
export async function joinGroupChallenge(
  challengeId: string,
): Promise<GroupChallengeJoinResponse> {
  return request<GroupChallengeJoinResponse>(
    `/api/group-challenges/${challengeId}/join`,
    { method: 'POST' },
  );
}

/**
 * Submit a guess for a group challenge.
 * Requires authentication.
 *
 * POST /api/group-challenges/:challengeId/guess
 */
export async function submitGroupChallengeGuess(
  challengeId: string,
  guess: string,
): Promise<GroupChallengeGuessResponse> {
  return request<GroupChallengeGuessResponse>(
    `/api/group-challenges/${challengeId}/guess`,
    {
      method: 'POST',
      body: JSON.stringify({ guess }),
    },
  );
}

/**
 * Decline a group challenge.
 * Requires authentication.
 *
 * POST /api/group-challenges/:challengeId/decline
 */
export async function declineGroupChallenge(
  challengeId: string,
): Promise<GroupChallengeDeclineResponse> {
  return request<GroupChallengeDeclineResponse>(
    `/api/group-challenges/${challengeId}/decline`,
    { method: 'POST' },
  );
}
