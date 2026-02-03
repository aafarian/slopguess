/**
 * Achievement routes.
 *
 * GET  /api/achievements        — List all achievements with user's unlock status (requireAuth)
 * GET  /api/achievements/recent — Recently unlocked achievements (last 7 days) (requireAuth)
 * GET  /api/achievements/xp     — Current XP status (level, progress) (requireAuth)
 */

import { Router, Request, Response, NextFunction } from "express";
import { requireAuth } from "../middleware/auth";
import { achievementService } from "../services/achievements";
import { xpService } from "../services/xp";

const achievementsRouter = Router();

// All achievement routes require authentication
achievementsRouter.use(requireAuth);

// ---------------------------------------------------------------------------
// GET / — List all achievements with user's unlock status
// ---------------------------------------------------------------------------

achievementsRouter.get(
  "/",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.userId;

      const achievements = await achievementService.getUserAchievements(userId);
      const unlocked = achievements.filter((a) => a.unlockedAt !== null).length;

      res.status(200).json({
        total: achievements.length,
        unlocked,
        achievements,
      });
    } catch (err: unknown) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /recent — Recently unlocked achievements (last 7 days)
// ---------------------------------------------------------------------------

achievementsRouter.get(
  "/recent",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.userId;

      const achievements = await achievementService.getRecentlyUnlocked(userId);

      res.status(200).json({ achievements });
    } catch (err: unknown) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /xp — Current XP status (level, progress toward next level)
// ---------------------------------------------------------------------------

achievementsRouter.get(
  "/xp",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.userId;

      const xpStatus = await xpService.getXPStatus(userId);

      res.status(200).json(xpStatus);
    } catch (err: unknown) {
      next(err);
    }
  },
);

export { achievementsRouter };
