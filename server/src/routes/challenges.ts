/**
 * Challenge routes.
 *
 * POST   /api/challenges                          — Create a new challenge (requireAuth)
 * GET    /api/challenges/incoming                  — Pending challenges where user is challenged (requireAuth)
 * GET    /api/challenges/sent                      — Challenges where user is challenger (requireAuth)
 * GET    /api/challenges/history/:friendId         — Paginated challenge history with a friend (requireAuth)
 * GET    /api/challenges/:challengeId              — Get challenge detail (requireAuth)
 * POST   /api/challenges/:challengeId/guess        — Submit a guess (requireAuth)
 * POST   /api/challenges/:challengeId/decline      — Decline a challenge (requireAuth)
 */

import { Router, Request, Response, NextFunction } from "express";
import { requireAuth } from "../middleware/auth";
import { challengeService } from "../services/challengeService";
import { containsBlockedContent } from "../services/contentFilter";
import * as friendshipService from "../services/friendshipService";

const challengesRouter = Router();

// All challenge routes require authentication
challengesRouter.use(requireAuth);

/** Maximum length for prompt text. */
const MAX_PROMPT_LENGTH = 200;

/** Maximum length for guess text. */
const MAX_GUESS_LENGTH = 200;

// ---------------------------------------------------------------------------
// POST / — Create a new challenge
// ---------------------------------------------------------------------------

challengesRouter.post(
  "/",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { friendId, prompt } = req.body as {
        friendId?: string;
        prompt?: string;
      };

      // Validate friendId
      if (!friendId || typeof friendId !== "string") {
        res.status(400).json({
          error: {
            message: "friendId is required",
            code: "MISSING_FRIEND_ID",
          },
        });
        return;
      }

      // Validate prompt
      if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
        res.status(400).json({
          error: {
            message: "Prompt is required and cannot be empty",
            code: "MISSING_PROMPT",
          },
        });
        return;
      }

      if (prompt.length > MAX_PROMPT_LENGTH) {
        res.status(400).json({
          error: {
            message: `Prompt must be ${MAX_PROMPT_LENGTH} characters or less`,
            code: "PROMPT_TOO_LONG",
          },
        });
        return;
      }

      const promptText = prompt.trim();

      // Content filter
      if (containsBlockedContent(promptText)) {
        res.status(400).json({
          error: {
            message:
              "Your prompt contains inappropriate language. Please try again.",
            code: "INAPPROPRIATE_CONTENT",
          },
        });
        return;
      }

      const userId = req.user!.userId;

      // Cannot challenge yourself
      if (userId === friendId) {
        res.status(400).json({
          error: {
            message: "You cannot challenge yourself",
            code: "SELF_CHALLENGE",
          },
        });
        return;
      }

      const challenge = await challengeService.createChallenge(
        userId,
        friendId,
        promptText,
      );

      res.status(202).json({ challenge });
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.message.includes("non-friend")) {
          res.status(403).json({
            error: {
              message: "You can only challenge friends",
              code: "NOT_FRIENDS",
            },
          });
          return;
        }

        if (err.message.includes("blocked content")) {
          res.status(400).json({
            error: {
              message:
                "Your prompt contains inappropriate language. Please try again.",
              code: "INAPPROPRIATE_CONTENT",
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
// GET /incoming — Pending challenges where user is the challenged party
// ---------------------------------------------------------------------------

challengesRouter.get(
  "/incoming",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.userId;

      const challenges = await challengeService.getPendingChallenges(userId);

      res.status(200).json({ challenges });
    } catch (err: unknown) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /sent — Challenges where user is the challenger
// ---------------------------------------------------------------------------

challengesRouter.get(
  "/sent",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.userId;

      const challenges = await challengeService.getSentChallenges(userId);

      res.status(200).json({ challenges });
    } catch (err: unknown) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /history/:friendId — Paginated challenge history with a friend
// ---------------------------------------------------------------------------

challengesRouter.get(
  "/history/:friendId",
  async (
    req: Request<{ friendId: string }>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const { friendId } = req.params;

      // Verify they are friends
      const friends = await friendshipService.areFriends(userId, friendId);
      if (!friends) {
        res.status(403).json({
          error: {
            message: "You can only view challenge history with friends",
            code: "NOT_FRIENDS",
          },
        });
        return;
      }

      const page = Math.max(
        1,
        parseInt(req.query.page as string, 10) || 1,
      );
      const limit = Math.min(
        50,
        Math.max(1, parseInt(req.query.limit as string, 10) || 10),
      );

      const { challenges, total } =
        await challengeService.getChallengesBetween(userId, friendId, {
          page,
          limit,
        });

      const totalPages = Math.ceil(total / limit);

      res.status(200).json({
        challenges,
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
  },
);

// ---------------------------------------------------------------------------
// GET /:challengeId — Get challenge detail
// ---------------------------------------------------------------------------

challengesRouter.get(
  "/:challengeId",
  async (
    req: Request<{ challengeId: string }>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const { challengeId } = req.params;

      const challenge = await challengeService.getChallengeById(
        challengeId,
        userId,
      );

      if (!challenge) {
        res.status(404).json({
          error: {
            message: "Challenge not found",
            code: "CHALLENGE_NOT_FOUND",
          },
        });
        return;
      }

      res.status(200).json({ challenge });
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.message.includes("not a participant")) {
          res.status(403).json({
            error: {
              message: "You are not a participant in this challenge",
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
// POST /:challengeId/guess — Submit a guess for a challenge
// ---------------------------------------------------------------------------

challengesRouter.post(
  "/:challengeId/guess",
  async (
    req: Request<{ challengeId: string }>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const { challengeId } = req.params;
      const { guess } = req.body as { guess?: string };

      // Validate input
      if (!guess || typeof guess !== "string" || guess.trim().length === 0) {
        res.status(400).json({
          error: {
            message: "Guess text is required and cannot be empty",
            code: "INVALID_GUESS",
          },
        });
        return;
      }

      if (guess.length > MAX_GUESS_LENGTH) {
        res.status(400).json({
          error: {
            message: `Guess text must be ${MAX_GUESS_LENGTH} characters or less`,
            code: "GUESS_TOO_LONG",
          },
        });
        return;
      }

      const guessText = guess.trim();

      // Content filter
      if (containsBlockedContent(guessText)) {
        res.status(400).json({
          error: {
            message:
              "Your guess contains inappropriate language. Please try again.",
            code: "INAPPROPRIATE_CONTENT",
          },
        });
        return;
      }

      const challenge = await challengeService.submitGuess(
        challengeId,
        userId,
        guessText,
      );

      res.status(200).json({ challenge });
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.message.includes("Challenge not found")) {
          res.status(404).json({
            error: {
              message: "Challenge not found",
              code: "CHALLENGE_NOT_FOUND",
            },
          });
          return;
        }

        if (err.message.includes("Only the challenged user")) {
          res.status(403).json({
            error: {
              message: "Only the challenged user can submit a guess",
              code: "NOT_CHALLENGED_USER",
            },
          });
          return;
        }

        if (err.message.includes("must be 'active'")) {
          res.status(400).json({
            error: {
              message: "Challenge is not active",
              code: "CHALLENGE_NOT_ACTIVE",
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
// POST /:challengeId/decline — Decline a challenge
// ---------------------------------------------------------------------------

challengesRouter.post(
  "/:challengeId/decline",
  async (
    req: Request<{ challengeId: string }>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const { challengeId } = req.params;

      const challenge = await challengeService.declineChallenge(
        challengeId,
        userId,
      );

      res.status(200).json({ challenge });
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.message.includes("Challenge not found")) {
          res.status(404).json({
            error: {
              message: "Challenge not found",
              code: "CHALLENGE_NOT_FOUND",
            },
          });
          return;
        }

        if (err.message.includes("Only the challenged user")) {
          res.status(403).json({
            error: {
              message: "Only the challenged user can decline",
              code: "NOT_CHALLENGED_USER",
            },
          });
          return;
        }

        if (err.message.includes("must be 'active'")) {
          res.status(400).json({
            error: {
              message: "Challenge is not active",
              code: "CHALLENGE_NOT_ACTIVE",
            },
          });
          return;
        }
      }

      next(err);
    }
  },
);

export { challengesRouter };
