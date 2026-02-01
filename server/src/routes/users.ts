/**
 * User routes.
 *
 * GET  /api/users/me/history — Current user's game history (requireAuth)
 * GET  /api/users/me/stats   — Current user's statistics (requireAuth)
 */

import { Router, Request, Response, NextFunction } from "express";
import { requireAuth } from "../middleware/auth";
import { leaderboardService } from "../services/leaderboardService";

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

      const stats = await leaderboardService.getUserStats(userId);

      res.status(200).json({ stats });
    } catch (err: unknown) {
      next(err);
    }
  }
);

export { usersRouter };
