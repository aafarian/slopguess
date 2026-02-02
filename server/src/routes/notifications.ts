/**
 * Notifications routes.
 *
 * GET    /api/notifications                        — Get user's notifications (requireAuth)
 * GET    /api/notifications/unread-count            — Get unread notification count (requireAuth)
 * PATCH  /api/notifications/:notificationId/read   — Mark notification as read (requireAuth)
 */

import { Router, Request, Response, NextFunction } from "express";
import { requireAuth } from "../middleware/auth";
import { notificationService } from "../services/notificationService";

const notificationsRouter = Router();

// All notification routes require authentication
notificationsRouter.use(requireAuth);

// ---------------------------------------------------------------------------
// GET / — Get user's notifications sorted by createdAt DESC
// ---------------------------------------------------------------------------

notificationsRouter.get(
  "/",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.userId;

      const notifications = await notificationService.getNotifications(userId);

      res.status(200).json({ notifications });
    } catch (err: unknown) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /unread-count — Get unread notification count
// ---------------------------------------------------------------------------

notificationsRouter.get(
  "/unread-count",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.userId;

      const count = await notificationService.getUnreadCount(userId);

      res.status(200).json({ count });
    } catch (err: unknown) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// PATCH /:notificationId/read — Mark notification as read
// ---------------------------------------------------------------------------

notificationsRouter.patch(
  "/:notificationId/read",
  async (
    req: Request<{ notificationId: string }>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { notificationId } = req.params;
      const userId = req.user!.userId;

      const success = await notificationService.markRead(notificationId, userId);

      if (!success) {
        res.status(404).json({
          error: {
            message: "Notification not found",
            code: "NOTIFICATION_NOT_FOUND",
          },
        });
        return;
      }

      res.status(200).json({ message: "Notification marked as read" });
    } catch (err: unknown) {
      next(err);
    }
  },
);

export { notificationsRouter };
