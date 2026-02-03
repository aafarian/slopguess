/**
 * Shared social-feature types used across the frontend.
 * These mirror the exact shapes returned by the backend API.
 */

import type { Pagination } from './game';

// ---------------------------------------------------------------------------
// Friendship
// ---------------------------------------------------------------------------

/** Friendship lifecycle status -- matches server FriendshipStatus. */
export type FriendshipStatus = 'pending' | 'accepted' | 'declined' | 'blocked';

/** Public friendship as returned by the API (matches server PublicFriendship). */
export interface Friendship {
  id: string;
  friendId: string;
  friendUsername: string;
  status: FriendshipStatus;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Challenge
// ---------------------------------------------------------------------------

/** Challenge lifecycle status -- matches server ChallengeStatus. */
export type ChallengeStatus =
  | 'pending'
  | 'active'
  | 'guessed'
  | 'completed'
  | 'expired'
  | 'declined';

/**
 * Public challenge as returned by the API (matches server PublicChallenge).
 * The prompt is optional -- hidden from the challenged user until the
 * challenge status is 'guessed' or 'completed'.
 */
export interface Challenge {
  id: string;
  challengerId: string;
  challengedId: string;
  challengerUsername: string;
  challengedUsername: string;
  imageUrl: string | null;
  challengerScore: number | null;
  challengedScore: number | null;
  challengedGuess: string | null;
  status: ChallengeStatus;
  createdAt: string;
  prompt?: string;
}

// ---------------------------------------------------------------------------
// Message
// ---------------------------------------------------------------------------

/** Public message as returned by the API (matches server PublicMessage). */
export interface Message {
  id: string;
  senderId: string;
  senderUsername: string;
  receiverId: string;
  content: string;
  read: boolean;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Notification
// ---------------------------------------------------------------------------

/** Supported notification types -- matches server NotificationType. */
export type NotificationType =
  | 'friend_request'
  | 'friend_accepted'
  | 'challenge_received'
  | 'challenge_guessed'
  | 'new_message';

/** A single notification record as returned by the API. */
export interface Notification {
  id: string;
  type: NotificationType;
  data: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Conversation preview
// ---------------------------------------------------------------------------

/** Conversation summary returned by GET /api/messages/conversations. */
export interface ConversationPreview {
  partnerId: string;
  partnerUsername: string;
  lastMessage: Message;
  unreadCount: number;
}

// ---------------------------------------------------------------------------
// User search result
// ---------------------------------------------------------------------------

/** A single user entry returned by the search endpoint. */
export interface UserSearchResult {
  id: string;
  username: string;
  friendshipStatus: string | null;
}

// ---------------------------------------------------------------------------
// Public Profile
// ---------------------------------------------------------------------------

/** A recent achievement entry returned in the public profile. */
export interface PublicProfileAchievement {
  id: string;
  key: string;
  title: string;
  description: string;
  icon: string;
  category: string;
  unlockedAt: string;
}

/** Public profile data as returned by GET /api/users/:username/profile. */
export interface PublicProfile {
  username: string;
  createdAt: string;
  level: number;
  xp: number;
  stats: {
    totalGamesPlayed: number;
    averageScore: number;
    bestScore: number;
  };
  recentAchievements: PublicProfileAchievement[];
  currentStreak: number;
  isFriend?: boolean;
  friendshipId?: string;
}

/** Response from GET /api/users/:username/profile. */
export interface PublicProfileResponse {
  profile: PublicProfile;
}

// ---------------------------------------------------------------------------
// Activity feed
// ---------------------------------------------------------------------------

/** Supported activity event types -- matches server ActivityEventType. */
export type ActivityEventType =
  | 'game_played'
  | 'achievement_unlocked'
  | 'challenge_completed'
  | 'level_up';

/** A single activity event as returned by the API. */
export interface ActivityEvent {
  id: string;
  userId: string;
  username: string;
  eventType: ActivityEventType;
  data: Record<string, unknown>;
  createdAt: string;
}

/** Response from GET /api/activity/feed or /api/activity/user/:username. */
export interface ActivityFeedResponse {
  events: ActivityEvent[];
  hasMore: boolean;
}

// ---------------------------------------------------------------------------
// Group Challenge
// ---------------------------------------------------------------------------

/** Group challenge lifecycle status -- matches server GroupChallengeStatus. */
export type GroupChallengeStatus =
  | 'pending'
  | 'active'
  | 'scoring'
  | 'completed'
  | 'expired';

/** Participant status within a group challenge -- matches server ParticipantStatus. */
export type GroupChallengeParticipantStatus =
  | 'pending'
  | 'joined'
  | 'guessed'
  | 'declined';

/** A single participant in a group challenge. */
export interface GroupChallengeParticipant {
  id: string;
  userId: string;
  username: string;
  guessText: string | null;
  score: number | null;
  status: GroupChallengeParticipantStatus;
}

/** Public group challenge as returned by the API (matches server PublicGroupChallenge). */
export interface GroupChallenge {
  id: string;
  creatorId: string;
  creatorUsername: string;
  imageUrl: string | null;
  status: GroupChallengeStatus;
  participants: GroupChallengeParticipant[];
  createdAt: string;
  updatedAt: string;
  prompt?: string;
}

// ---------------------------------------------------------------------------
// API response wrappers — Friends
// ---------------------------------------------------------------------------

/** Response from GET /api/friends (accepted friends list). */
export interface FriendsListResponse {
  friends: Friendship[];
}

/** Response from GET /api/friends/requests (pending received requests). */
export interface PendingRequestsResponse {
  requests: Friendship[];
}

/** Response from GET /api/friends/search?q= (user search results). */
export interface UserSearchResponse {
  users: UserSearchResult[];
}

// ---------------------------------------------------------------------------
// API response wrappers — Challenges
// ---------------------------------------------------------------------------

/** Response from GET /api/challenges/incoming or /sent (list of challenges). */
export interface ChallengeListResponse {
  challenges: Challenge[];
}

/** Response from GET /api/challenges/:challengeId (single challenge). */
export interface ChallengeDetailResponse {
  challenge: Challenge;
}

/** Response from POST /api/challenges/:challengeId/guess. */
export interface ChallengeGuessResponse {
  challenge: Challenge;
}

/** Response from GET /api/challenges/history/:friendId (paginated). */
export interface ChallengeHistoryResponse {
  challenges: Challenge[];
  pagination: Pagination;
}

// ---------------------------------------------------------------------------
// API response wrappers — Messages
// ---------------------------------------------------------------------------

/** Response from GET /api/messages/conversations. */
export interface ConversationListResponse {
  conversations: ConversationPreview[];
}

/** Response from GET /api/messages/:userId (paginated conversation). */
export interface ConversationResponse {
  messages: Message[];
  pagination: Pagination;
}

// ---------------------------------------------------------------------------
// API response wrappers — Notifications
// ---------------------------------------------------------------------------

/** Response from GET /api/notifications. */
export interface NotificationsResponse {
  notifications: Notification[];
}

/** Response from GET /api/notifications/unread-count. */
export interface UnreadCountResponse {
  count: number;
}

// ---------------------------------------------------------------------------
// API response wrappers — Group Challenges
// ---------------------------------------------------------------------------

/** Response from GET /api/group-challenges (list of user's group challenges). */
export interface GroupChallengeListResponse {
  groupChallenges: GroupChallenge[];
}

/** Response from GET /api/group-challenges/:challengeId (single group challenge). */
export interface GroupChallengeDetailResponse {
  groupChallenge: GroupChallenge;
}

/** Response from POST /api/group-challenges (create group challenge). */
export interface GroupChallengeCreateResponse {
  groupChallenge: GroupChallenge;
}

/** Response from POST /api/group-challenges/:challengeId/join. */
export interface GroupChallengeJoinResponse {
  groupChallenge: GroupChallenge;
}

/** Response from POST /api/group-challenges/:challengeId/guess. */
export interface GroupChallengeGuessResponse {
  groupChallenge: GroupChallenge;
}

/** Response from POST /api/group-challenges/:challengeId/decline. */
export interface GroupChallengeDeclineResponse {
  groupChallenge: GroupChallenge;
}
