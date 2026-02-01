/**
 * User routes.
 *
 * GET  /api/users/me/history       — Current user's game history (requireAuth)
 * GET  /api/users/me/stats         — Current user's statistics (requireAuth)
 * GET  /api/users/me/streaks       — Current user's streak data (requireAuth)
 * GET  /api/users/me/weekly-stats  — Current user's last-7-day stats (requireAuth)
 */

import { Router, Request, Response, NextFunction } from "express";
import { requireAuth } from "../middleware/auth";
import { leaderboardService } from "../services/leaderboardService";
import { streakService } from "../services/streakService";

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

export { usersRouter };
