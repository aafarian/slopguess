/**
 * Activity feed routes.
 *
 * GET  /api/activity/feed            — Friend activity feed (requireAuth)
 * GET  /api/activity/user/:username  — Public activity for a specific user (optionalAuth)
 */

import { Router, Request, Response, NextFunction } from "express";
import { requireAuth, optionalAuth } from "../middleware/auth";
import { activityFeedService } from "../services/activityFeedService";
import { getPublicProfile } from "../services/userService";

const activityRouter = Router();

// ---------------------------------------------------------------------------
// GET /feed — Friend activity feed (requires auth)
// ---------------------------------------------------------------------------

activityRouter.get(
  "/feed",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.userId;

      const limit = Math.min(
        Math.max(parseInt(req.query.limit as string, 10) || 20, 1),
        100,
      );
      const offset = Math.max(
        parseInt(req.query.offset as string, 10) || 0,
        0,
      );

      const events = await activityFeedService.getFriendFeed(
        userId,
        limit + 1,
        offset,
      );

      const hasMore = events.length > limit;
      const trimmedEvents = hasMore ? events.slice(0, limit) : events;

      res.status(200).json({
        events: trimmedEvents,
        hasMore,
      });
    } catch (err: unknown) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /user/:username — Public activity for a specific user (optionalAuth)
// ---------------------------------------------------------------------------

activityRouter.get(
  "/user/:username",
  optionalAuth,
  async (
    req: Request<{ username: string }>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { username } = req.params;

      // Look up user by username to get their ID
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

      const limit = Math.min(
        Math.max(parseInt(req.query.limit as string, 10) || 20, 1),
        100,
      );
      const offset = Math.max(
        parseInt(req.query.offset as string, 10) || 0,
        0,
      );

      const events = await activityFeedService.getUserFeed(
        profileUser.id,
        limit + 1,
        offset,
      );

      const hasMore = events.length > limit;
      const trimmedEvents = hasMore ? events.slice(0, limit) : events;

      res.status(200).json({
        events: trimmedEvents,
        hasMore,
      });
    } catch (err: unknown) {
      next(err);
    }
  },
);

export { activityRouter };
