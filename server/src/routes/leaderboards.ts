/**
 * Seasonal leaderboard routes.
 *
 * GET  /api/leaderboards/:periodType     — Leaderboard for a period (optionalAuth)
 * GET  /api/leaderboards/:periodType/me  — Current user's rank & stats (requireAuth)
 */

import { Router, Request, Response, NextFunction } from "express";
import { requireAuth, optionalAuth } from "../middleware/auth";
import {
  seasonalLeaderboardService,
  type PeriodType,
} from "../services/seasonalLeaderboard";

const leaderboardsRouter = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_PERIOD_TYPES = new Set<string>(["weekly", "monthly", "all_time"]);

function isValidPeriodType(value: string): value is PeriodType {
  return VALID_PERIOD_TYPES.has(value);
}

// ---------------------------------------------------------------------------
// GET /:periodType — Leaderboard for a period
// ---------------------------------------------------------------------------

leaderboardsRouter.get(
  "/:periodType",
  optionalAuth,
  async (
    req: Request<{ periodType: string }>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { periodType } = req.params;

      if (!isValidPeriodType(periodType)) {
        res.status(400).json({
          error: {
            message: "Invalid period type. Must be 'weekly', 'monthly', or 'all_time'.",
            code: "INVALID_PERIOD_TYPE",
          },
        });
        return;
      }

      // Use query param ?period= for past periods, otherwise default to current
      const periodKey =
        (req.query.period as string) ||
        seasonalLeaderboardService.defaultPeriodKey(periodType);

      const limit = Math.min(
        100,
        Math.max(1, parseInt(req.query.limit as string, 10) || 50),
      );
      const offset = Math.max(0, parseInt(req.query.offset as string, 10) || 0);

      const entries = await seasonalLeaderboardService.getLeaderboard(
        periodType,
        periodKey,
        limit,
        offset,
      );

      res.status(200).json({
        periodType,
        periodKey,
        entries,
        pagination: { limit, offset },
      });
    } catch (err: unknown) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /:periodType/me — Current user's rank & stats
// ---------------------------------------------------------------------------

leaderboardsRouter.get(
  "/:periodType/me",
  requireAuth,
  async (
    req: Request<{ periodType: string }>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { periodType } = req.params;

      if (!isValidPeriodType(periodType)) {
        res.status(400).json({
          error: {
            message: "Invalid period type. Must be 'weekly', 'monthly', or 'all_time'.",
            code: "INVALID_PERIOD_TYPE",
          },
        });
        return;
      }

      const periodKey =
        (req.query.period as string) ||
        seasonalLeaderboardService.defaultPeriodKey(periodType);

      const userRank = await seasonalLeaderboardService.getUserRank(
        req.user!.userId,
        periodType,
        periodKey,
      );

      if (!userRank) {
        res.status(200).json({
          periodType,
          periodKey,
          rank: null,
          message: "No entries for this period",
        });
        return;
      }

      res.status(200).json({
        periodType,
        periodKey,
        ...userRank,
      });
    } catch (err: unknown) {
      next(err);
    }
  },
);

export { leaderboardsRouter };
