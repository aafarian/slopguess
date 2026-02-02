/**
 * Messages routes.
 *
 * POST   /api/messages                       — Send a message to a friend (requireAuth)
 * GET    /api/messages/conversations          — List all conversations (requireAuth)
 * GET    /api/messages/:userId?page=&limit=   — Get paginated conversation with a user (requireAuth)
 * PATCH  /api/messages/:messageId/read        — Mark a message as read (requireAuth)
 */

import { Router, Request, Response, NextFunction } from "express";
import { requireAuth } from "../middleware/auth";
import { messageService } from "../services/messageService";

const messagesRouter = Router();

// All messages routes require authentication
messagesRouter.use(requireAuth);

// ---------------------------------------------------------------------------
// POST / — Send a message to a friend
// ---------------------------------------------------------------------------

messagesRouter.post(
  "/",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { receiverId, content } = req.body as {
        receiverId?: string;
        content?: string;
      };

      if (!receiverId || typeof receiverId !== "string") {
        res.status(400).json({
          error: {
            message: "receiverId is required",
            code: "MISSING_RECEIVER_ID",
          },
        });
        return;
      }

      if (!content || typeof content !== "string" || content.trim().length === 0) {
        res.status(400).json({
          error: {
            message: "Message content cannot be empty",
            code: "EMPTY_CONTENT",
          },
        });
        return;
      }

      if (content.trim().length > 500) {
        res.status(400).json({
          error: {
            message: "Message content cannot exceed 500 characters",
            code: "CONTENT_TOO_LONG",
          },
        });
        return;
      }

      const senderId = req.user!.userId;

      const message = await messageService.sendMessage(
        senderId,
        receiverId,
        content,
      );

      res.status(201).json({ message });
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.message.includes("message to yourself")) {
          res.status(400).json({
            error: {
              message: "Cannot send a message to yourself",
              code: "SELF_MESSAGE",
            },
          });
          return;
        }

        if (err.message.includes("only send messages to friends")) {
          res.status(403).json({
            error: {
              message: "You can only send messages to friends",
              code: "NOT_FRIENDS",
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
// GET /conversations — List all conversations with latest message & unread count
// ---------------------------------------------------------------------------

messagesRouter.get(
  "/conversations",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.userId;

      const conversations = await messageService.getConversationList(userId);

      res.status(200).json({ conversations });
    } catch (err: unknown) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /:userId — Get paginated conversation with a specific user
// ---------------------------------------------------------------------------

messagesRouter.get(
  "/:userId",
  async (
    req: Request<{ userId: string }>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const currentUserId = req.user!.userId;
      const { userId } = req.params;

      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = parseInt(req.query.limit as string, 10) || 20;

      const result = await messageService.getConversation(
        currentUserId,
        userId,
        { page, limit },
      );

      res.status(200).json({
        messages: result.data,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages,
        },
      });
    } catch (err: unknown) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// PATCH /:messageId/read — Mark a message as read
// ---------------------------------------------------------------------------

messagesRouter.patch(
  "/:messageId/read",
  async (
    req: Request<{ messageId: string }>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const { messageId } = req.params;

      const message = await messageService.markAsRead(messageId, userId);

      res.status(200).json({ message });
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.message.includes("not found")) {
          res.status(404).json({
            error: {
              message: "Message not found",
              code: "MESSAGE_NOT_FOUND",
            },
          });
          return;
        }

        if (err.message.includes("Only the recipient")) {
          res.status(403).json({
            error: {
              message: "Only the recipient can mark a message as read",
              code: "NOT_RECIPIENT",
            },
          });
          return;
        }
      }

      next(err);
    }
  },
);

export { messagesRouter };
