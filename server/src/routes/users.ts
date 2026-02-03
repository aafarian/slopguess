/**
 * User routes.
 *
 * GET  /api/users/me/history           — Current user's game history (requireAuth)
 * GET  /api/users/me/stats             — Current user's statistics (requireAuth)
 * GET  /api/users/me/streaks           — Current user's streak data (requireAuth)
 * GET  /api/users/me/weekly-stats      — Current user's last-7-day stats (requireAuth)
 * GET  /api/users/:username/profile    — Public profile (optionalAuth)
 */

import { Router, Request, Response, NextFunction } from "express";
import { requireAuth, optionalAuth } from "../middleware/auth";
import { leaderboardService } from "../services/leaderboardService";
import { streakService } from "../services/streakService";
import { getPublicProfile } from "../services/userService";
import { achievementService } from "../services/achievements";
import { pool } from "../config/database";

const usersRouter = Router();

// ---------------------------------------------------------------------------
// GET /me/history — Current user's game history (paginated)
// ---------------------------------------------------------------------------

usersRouter.get(
  "/me/history",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string, 10) || 10));

      const { entries, total } = await leaderboardService.getUserHistory(
        userId,
        page,
        limit
      );

      const totalPages = Math.ceil(total / limit);

      res.status(200).json({
        history: entries,
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
      });
    } catch (err: unknown) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /me/stats — Current user's statistics
// ---------------------------------------------------------------------------

usersRouter.get(
  "/me/stats",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.userId;

      const [stats, streak] = await Promise.all([
        leaderboardService.getUserStats(userId),
        streakService.getStreak(userId),
      ]);

      res.status(200).json({ stats: { ...stats, streak } });
    } catch (err: unknown) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /me/streaks — Current user's streak data
// ---------------------------------------------------------------------------

usersRouter.get(
  "/me/streaks",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.userId;

      const streak = await streakService.getStreak(userId);

      res.status(200).json({ streak });
    } catch (err: unknown) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /me/weekly-stats — Current user's last-7-day stats
// ---------------------------------------------------------------------------

usersRouter.get(
  "/me/weekly-stats",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.userId;

      const weeklyStats = await streakService.getWeeklyStats(userId);

      res.status(200).json({ weeklyStats });
    } catch (err: unknown) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /:username/profile — Public profile (optionalAuth)
// ---------------------------------------------------------------------------

usersRouter.get(
  "/:username/profile",
  optionalAuth,
  async (
    req: Request<{ username: string }>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { username } = req.params;

      // Look up the user by username (returns only safe public fields)
      const profileUser = await getPublicProfile(username);

      if (!profileUser) {
        res.status(404).json({
          error: {
            message: "User not found",
            code: "USER_NOT_FOUND",
          },
        });
        return;
      }

      // Gather public stats, recent achievements, and streak in parallel
      const [stats, recentAchievements, streakResult] = await Promise.all([
        leaderboardService.getPublicStats(profileUser.id),
        achievementService.getRecentlyUnlocked(profileUser.id),
        streakService.getStreak(profileUser.id),
      ]);

      // Build the response — never expose email, password_hash, or subscription_tier
      const profile: Record<string, unknown> = {
        username: profileUser.username,
        createdAt: profileUser.createdAt,
        level: profileUser.level,
        xp: profileUser.xp,
        stats: {
          totalGamesPlayed: stats.totalGamesPlayed,
          averageScore: stats.averageScore,
          bestScore: stats.bestScore,
        },
        recentAchievements: recentAchievements.slice(0, 5),
        currentStreak: streakResult.currentStreak,
      };

      // If the viewer is authenticated, check friendship status
      if (req.user) {
        const viewerId = req.user.userId;

        // Only check friendship if the viewer is not viewing their own profile
        if (viewerId !== profileUser.id) {
          const friendshipResult = await pool.query<{
            id: string;
            status: string;
          }>(
            `SELECT id, status
             FROM friendships
             WHERE ((sender_id = $1 AND receiver_id = $2)
                OR  (sender_id = $2 AND receiver_id = $1))
               AND status = 'accepted'`,
            [viewerId, profileUser.id],
          );

          if (friendshipResult.rows.length > 0) {
            profile.isFriend = true;
            profile.friendshipId = friendshipResult.rows[0].id;
          } else {
            profile.isFriend = false;
          }
        }
      }

      res.status(200).json({ profile });
    } catch (err: unknown) {
      next(err);
    }
  },
);

export { usersRouter };
