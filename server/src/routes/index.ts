/**
 * API Route Index
 *
 * All routes are mounted under the /api prefix (set in app.ts).
 *
 * ┌─────────────────────────────────┬────────┬──────────────────────────────────────────┐
 * │ Endpoint                        │ Method │ Description                              │
 * ├─────────────────────────────────┼────────┼──────────────────────────────────────────┤
 * │ /api/health                     │ GET    │ Health check with DB connectivity status  │
 * ├─────────────────────────────────┼────────┼──────────────────────────────────────────┤
 * │ /api/auth/register              │ POST   │ Create a new user account; returns JWT    │
 * │ /api/auth/login                 │ POST   │ Authenticate with email+password; JWT     │
 * │ /api/auth/me                    │ GET    │ Return current user (requires auth)       │
 * ├─────────────────────────────────┼────────┼──────────────────────────────────────────┤
 * │ /api/words                      │ GET    │ List all words (paginated: ?page, ?limit) │
 * │ /api/words/categories           │ GET    │ List categories with word counts          │
 * │ /api/words/random               │ GET    │ Get random words (?count=5)               │
 * ├─────────────────────────────────┼────────┼──────────────────────────────────────────┤
 * │ /api/rounds/active              │ GET    │ Current active round (optionalAuth)       │
 * │ /api/rounds/:roundId/guess      │ POST   │ Submit a guess (requireAuth)              │
 * │ /api/rounds/:roundId            │ GET    │ Get a specific round (optionalAuth)       │
 * │ /api/rounds/:roundId/leaderboard│ GET    │ Round leaderboard (public)                │
 * ├─────────────────────────────────┼────────┼──────────────────────────────────────────┤
 * │ /api/admin/rounds/rotate        │ POST   │ Manually trigger round rotation           │
 * │ /api/admin/rounds/next          │ GET    │ Next scheduled rotation time              │
 * └─────────────────────────────────┴────────┴──────────────────────────────────────────┘
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

const router = Router();

// Health check
router.use("/health", healthRouter);

// Authentication
router.use("/auth", authRouter);

// Word bank (admin/utility)
router.use("/words", wordBankRouter);

// Rounds (game loop — active round, guesses, leaderboard)
router.use("/rounds", roundsRouter);

// Admin (round management, dev tools)
router.use("/admin", adminRouter);

export { router };
