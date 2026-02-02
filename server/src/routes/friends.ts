/**
 * Friends routes.
 *
 * POST   /api/friends/request                — Send a friend request (requireAuth)
 * POST   /api/friends/:friendshipId/accept   — Accept a friend request (requireAuth)
 * POST   /api/friends/:friendshipId/decline  — Decline a friend request (requireAuth)
 * DELETE /api/friends/:friendshipId          — Remove a friend (requireAuth)
 * GET    /api/friends                        — List accepted friends (requireAuth)
 * GET    /api/friends/requests               — List pending received requests (requireAuth)
 * GET    /api/friends/search?q=query         — Search users by username prefix (requireAuth)
 */

import { Router, Request, Response, NextFunction } from "express";
import { requireAuth } from "../middleware/auth";
import * as friendshipService from "../services/friendshipService";

const friendsRouter = Router();

// All friends routes require authentication
friendsRouter.use(requireAuth);

// ---------------------------------------------------------------------------
// POST /request — Send a friend request
// ---------------------------------------------------------------------------

friendsRouter.post(
  "/request",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userId } = req.body as { userId?: string };

      if (!userId || typeof userId !== "string") {
        res.status(400).json({
          error: {
            message: "userId is required",
            code: "MISSING_USER_ID",
          },
        });
        return;
      }

      const senderId = req.user!.userId;

      const friendship = await friendshipService.sendRequest(senderId, userId);

      res.status(201).json({ friendship });
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.message.includes("friend request to yourself")) {
          res.status(400).json({
            error: {
              message: "Cannot send a friend request to yourself",
              code: "SELF_FRIEND_REQUEST",
            },
          });
          return;
        }

        if (err.message.includes("already exists")) {
          res.status(409).json({
            error: {
              message: "A friendship already exists between these users",
              code: "DUPLICATE_FRIENDSHIP",
            },
          });
          return;
        }

        if (err.message.includes("Cannot send a friend request to this user")) {
          res.status(403).json({
            error: {
              message: "Cannot send a friend request to this user",
              code: "BLOCKED_USER",
            },
          });
          return;
        }

        if (err.message.includes("Receiver not found")) {
          res.status(404).json({
            error: {
              message: "User not found",
              code: "USER_NOT_FOUND",
            },
          });
          return;
        }
      }

      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /:friendshipId/accept — Accept a friend request
// ---------------------------------------------------------------------------

friendsRouter.post(
  "/:friendshipId/accept",
  async (
    req: Request<{ friendshipId: string }>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { friendshipId } = req.params;
      const userId = req.user!.userId;

      const friendship = await friendshipService.acceptRequest(
        friendshipId,
        userId,
      );

      res.status(200).json({ friendship });
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.message.includes("not found")) {
          res.status(404).json({
            error: {
              message: "Friendship not found",
              code: "FRIENDSHIP_NOT_FOUND",
            },
          });
          return;
        }

        if (err.message.includes("Only the receiver")) {
          res.status(403).json({
            error: {
              message: "Only the receiver can accept a friend request",
              code: "NOT_RECEIVER",
            },
          });
          return;
        }

        if (err.message.includes("not pending")) {
          res.status(400).json({
            error: {
              message: "This request is not pending",
              code: "NOT_PENDING",
            },
          });
          return;
        }
      }

      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /:friendshipId/decline — Decline a friend request
// ---------------------------------------------------------------------------

friendsRouter.post(
  "/:friendshipId/decline",
  async (
    req: Request<{ friendshipId: string }>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { friendshipId } = req.params;
      const userId = req.user!.userId;

      const friendship = await friendshipService.declineRequest(
        friendshipId,
        userId,
      );

      res.status(200).json({ friendship });
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.message.includes("not found")) {
          res.status(404).json({
            error: {
              message: "Friendship not found",
              code: "FRIENDSHIP_NOT_FOUND",
            },
          });
          return;
        }

        if (err.message.includes("Only the receiver")) {
          res.status(403).json({
            error: {
              message: "Only the receiver can decline a friend request",
              code: "NOT_RECEIVER",
            },
          });
          return;
        }

        if (err.message.includes("not pending")) {
          res.status(400).json({
            error: {
              message: "This request is not pending",
              code: "NOT_PENDING",
            },
          });
          return;
        }
      }

      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// DELETE /:friendshipId — Remove a friend
// ---------------------------------------------------------------------------

friendsRouter.delete(
  "/:friendshipId",
  async (
    req: Request<{ friendshipId: string }>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { friendshipId } = req.params;
      const userId = req.user!.userId;

      await friendshipService.removeFriend(friendshipId, userId);

      res.status(200).json({ message: "Friend removed" });
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.message.includes("not found")) {
          res.status(404).json({
            error: {
              message: "Friendship not found",
              code: "FRIENDSHIP_NOT_FOUND",
            },
          });
          return;
        }

        if (err.message.includes("not part of this friendship")) {
          res.status(403).json({
            error: {
              message: "You are not part of this friendship",
              code: "NOT_PARTICIPANT",
            },
          });
          return;
        }
      }

      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET / — List accepted friends
// ---------------------------------------------------------------------------

friendsRouter.get(
  "/",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.userId;

      const friends = await friendshipService.getFriends(userId);

      res.status(200).json({ friends });
    } catch (err: unknown) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /requests — List pending received requests
// ---------------------------------------------------------------------------

friendsRouter.get(
  "/requests",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.userId;

      const requests = await friendshipService.getPendingRequests(userId);

      res.status(200).json({ requests });
    } catch (err: unknown) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /sent — List pending sent requests (outgoing)
// ---------------------------------------------------------------------------

friendsRouter.get(
  "/sent",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.userId;

      const requests = await friendshipService.getSentRequests(userId);

      res.status(200).json({ requests });
    } catch (err: unknown) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /search?q=query — Search users by username prefix
// ---------------------------------------------------------------------------

friendsRouter.get(
  "/search",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const q = req.query.q as string | undefined;

      if (!q || typeof q !== "string" || q.trim().length === 0) {
        res.status(400).json({
          error: {
            message: "Query parameter 'q' is required",
            code: "MISSING_QUERY",
          },
        });
        return;
      }

      const userId = req.user!.userId;
      const users = await friendshipService.searchUsers(q.trim(), userId);

      res.status(200).json({ users });
    } catch (err: unknown) {
      next(err);
    }
  },
);

export { friendsRouter };
