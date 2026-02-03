/**
 * API Route Index
 *
 * All routes are mounted under the /api prefix (set in app.ts).
 *
 * ┌─────────────────────────────────────┬────────┬──────────────────────────────────────────┐
 * │ Endpoint                            │ Method │ Description                              │
 * ├─────────────────────────────────────┼────────┼──────────────────────────────────────────┤
 * │ /api/health                         │ GET    │ Health check with DB connectivity status  │
 * ├─────────────────────────────────────┼────────┼──────────────────────────────────────────┤
 * │ /api/auth/register                  │ POST   │ Create a new user account; returns JWT    │
 * │ /api/auth/login                     │ POST   │ Authenticate with email+password; JWT     │
 * │ /api/auth/me                        │ GET    │ Return current user (requires auth)       │
 * ├─────────────────────────────────────┼────────┼──────────────────────────────────────────┤
 * │ /api/words                          │ GET    │ List all words (paginated: ?page, ?limit) │
 * │ /api/words/categories               │ GET    │ List categories with word counts          │
 * │ /api/words/random                   │ GET    │ Get random words (?count=5)               │
 * ├─────────────────────────────────────┼────────┼──────────────────────────────────────────┤
 * │ /api/rounds/active                  │ GET    │ Current active round (optionalAuth)       │
 * │ /api/rounds/history                 │ GET    │ Completed rounds list (paginated)         │
 * │ /api/rounds/:roundId/guess          │ POST   │ Submit a guess (requireAuth)              │
 * │ /api/rounds/:roundId                │ GET    │ Get a specific round (optionalAuth)       │
 * │ /api/rounds/:roundId/leaderboard    │ GET    │ Round leaderboard (public)                │
 * │ /api/rounds/:roundId/results        │ GET    │ Full results for completed round          │
 * │ /api/rounds/:roundId/share-data    │ GET    │ Share metadata for share buttons (auth)   │
 * │ /api/rounds/:roundId/share/:userId │ GET    │ Score card (HTML for bots, JSON for API)  │
 * ├─────────────────────────────────────┼────────┼──────────────────────────────────────────┤
 * │ /share/:roundId/:userId            │ GET    │ Public OG share page (outside /api)       │
 * ├─────────────────────────────────────┼────────┼──────────────────────────────────────────┤
 * │ /api/users/me/history               │ GET    │ Current user's game history (auth)        │
 * │ /api/users/me/stats                 │ GET    │ Current user's statistics (auth)          │
 * ├─────────────────────────────────────┼────────┼──────────────────────────────────────────┤
 * │ /api/admin/rounds/rotate            │ POST   │ Manually trigger round rotation           │
 * │ /api/admin/rounds/next              │ GET    │ Next scheduled rotation time              │
 * ├─────────────────────────────────────┼────────┼──────────────────────────────────────────┤
 * │ /api/friends                        │ GET    │ List accepted friends (auth)              │
 * │ /api/friends/request                │ POST   │ Send a friend request (auth)              │
 * │ /api/friends/requests               │ GET    │ List pending received requests (auth)     │
 * │ /api/friends/search?q=              │ GET    │ Search users by username prefix (auth)    │
 * │ /api/friends/:friendshipId/accept   │ POST   │ Accept a friend request (auth)            │
 * │ /api/friends/:friendshipId/decline  │ POST   │ Decline a friend request (auth)           │
 * │ /api/friends/:friendshipId          │ DELETE │ Remove a friend (auth)                    │
 * ├─────────────────────────────────────┼────────┼──────────────────────────────────────────┤
 * │ /api/challenges                     │ POST   │ Create a new challenge (auth)              │
 * │ /api/challenges/incoming            │ GET    │ Pending challenges for user (auth)         │
 * │ /api/challenges/sent                │ GET    │ Challenges sent by user (auth)             │
 * │ /api/challenges/history/:friendId   │ GET    │ Challenge history with friend (auth)       │
 * │ /api/challenges/:challengeId        │ GET    │ Get challenge detail (auth)                │
 * │ /api/challenges/:challengeId/guess  │ POST   │ Submit a guess for challenge (auth)        │
 * │ /api/challenges/:challengeId/decline│ POST   │ Decline a challenge (auth)                 │
 * ├─────────────────────────────────────┼────────┼──────────────────────────────────────────┤
 * │ /api/messages                       │ POST   │ Send a message to a friend (auth)         │
 * │ /api/messages/conversations         │ GET    │ List conversations with latest msg (auth)  │
 * │ /api/messages/:userId               │ GET    │ Paginated conversation with user (auth)    │
 * │ /api/messages/:messageId/read       │ PATCH  │ Mark a message as read (auth)              │
 * ├─────────────────────────────────────┼────────┼──────────────────────────────────────────┤
 * │ /api/notifications                  │ GET    │ Get user's notifications (auth)           │
 * │ /api/notifications/unread-count     │ GET    │ Get unread notification count (auth)      │
 * │ /api/notifications/:id/read        │ PATCH  │ Mark notification as read (auth)          │
 * ├─────────────────────────────────────┼────────┼──────────────────────────────────────────┤
 * │ /api/subscriptions/status           │ GET    │ Current subscription status + features    │
 * │ /api/subscriptions/checkout         │ POST   │ Create Stripe Checkout session (auth)     │
 * │ /api/subscriptions/portal           │ POST   │ Create Stripe Customer Portal (auth)      │
 * │ /api/subscriptions/webhook          │ POST   │ Stripe webhook endpoint (raw body)        │
 * ├─────────────────────────────────────┼────────┼──────────────────────────────────────────┤
 * │ /api/activity/feed                  │ GET    │ Friend activity feed (auth)               │
 * │ /api/activity/user/:username        │ GET    │ Public activity for a user (optionalAuth)  │
 * ├─────────────────────────────────────┼────────┼──────────────────────────────────────────┤
 * │ /api/group-challenges              │ POST   │ Create a group challenge (auth)            │
 * │ /api/group-challenges              │ GET    │ List user's group challenges (auth)        │
 * │ /api/group-challenges/:id          │ GET    │ Get group challenge detail (auth)          │
 * │ /api/group-challenges/:id/join     │ POST   │ Join a group challenge (auth)              │
 * │ /api/group-challenges/:id/guess    │ POST   │ Submit a guess for group challenge (auth)  │
 * │ /api/group-challenges/:id/decline  │ POST   │ Decline a group challenge (auth)           │
 * └─────────────────────────────────────┴────────┴──────────────────────────────────────────┘
 *
 * Auth: Routes marked "requires auth" expect an Authorization: Bearer <JWT> header.
 * Error responses follow the shape: { error: { message, code, details? } }
 */

import { Router } from "express";
import { healthRouter } from "./health";
import { authRouter } from "./auth";
import { wordBankRouter } from "./wordBank";
import { adminRouter } from "./admin";
import { roundsRouter } from "./rounds";
import { usersRouter } from "./users";
import { friendsRouter } from "./friends";
import { challengesRouter } from "./challenges";
import { messagesRouter } from "./messages";
import { notificationsRouter } from "./notifications";
import { achievementsRouter } from "./achievements";
import { leaderboardsRouter } from "./leaderboards";
import { subscriptionsRouter } from "./subscriptions";
import { activityRouter } from "./activity";
import { groupChallengesRouter } from "./groupChallenges";
const router = Router();

// Health check
router.use("/health", healthRouter);

// Authentication (rate limiting is applied per-endpoint in auth.ts)
router.use("/auth", authRouter);

// Word bank (admin/utility)
router.use("/words", wordBankRouter);

// Rounds (game loop — active round, guesses, leaderboard, history, results)
router.use("/rounds", roundsRouter);

// Users (game history, stats)
router.use("/users", usersRouter);

// Friends (friend requests, search, management)
router.use("/friends", friendsRouter);

// Challenges (1v1 image challenges between friends)
router.use("/challenges", challengesRouter);

// Messages (direct messages between friends)
router.use("/messages", messagesRouter);

// Notifications (user notifications, unread count, mark read)
router.use("/notifications", notificationsRouter);

// Achievements (achievement definitions, user progress, recent unlocks)
router.use("/achievements", achievementsRouter);

// Seasonal leaderboards (weekly, monthly, all-time aggregated rankings)
router.use("/leaderboards", leaderboardsRouter);

// Subscriptions (subscription status, Stripe checkout, portal, webhook)
router.use("/subscriptions", subscriptionsRouter);

// Activity feed (friend feed, per-user activity)
router.use("/activity", activityRouter);

// Group challenges (multi-player image challenges)
router.use("/group-challenges", groupChallengesRouter);

// Admin (round management, dev tools)
router.use("/admin", adminRouter);

export { router };
