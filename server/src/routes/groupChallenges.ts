/**
 * Group challenge routes.
 *
 * POST   /api/group-challenges                         — Create a new group challenge (requireAuth)
 * GET    /api/group-challenges                         — List user's group challenges (requireAuth)
 * GET    /api/group-challenges/:challengeId             — Get group challenge detail (requireAuth)
 * POST   /api/group-challenges/:challengeId/join        — Join a group challenge (requireAuth)
 * POST   /api/group-challenges/:challengeId/guess       — Submit a guess (requireAuth)
 * POST   /api/group-challenges/:challengeId/decline     — Decline a group challenge (requireAuth)
 */

import { Router, Request, Response, NextFunction } from "express";
import { requireAuth } from "../middleware/auth";
import { groupChallengeService } from "../services/groupChallengeService";
import { containsBlockedContent } from "../services/contentFilter";
import { achievementService } from "../services/achievements";
import { xpService } from "../services/xp";
import { activityFeedService } from "../services/activityFeedService";

const groupChallengesRouter = Router();

// All group challenge routes require authentication
groupChallengesRouter.use(requireAuth);

/** Maximum length for prompt text. */
const MAX_PROMPT_LENGTH = 200;

/** Maximum length for guess text. */
const MAX_GUESS_LENGTH = 200;

// ---------------------------------------------------------------------------
// POST / — Create a new group challenge
// ---------------------------------------------------------------------------

groupChallengesRouter.post(
  "/",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { participantIds, prompt } = req.body as {
        participantIds?: string[];
        prompt?: string;
      };

      const userId = req.user!.userId;

      // Validate participantIds
      if (
        !participantIds ||
        !Array.isArray(participantIds) ||
        participantIds.length === 0
      ) {
        res.status(400).json({
          error: {
            message: "participantIds is required and must be a non-empty array",
            code: "MISSING_PARTICIPANT_IDS",
          },
        });
        return;
      }

      // Validate each participantId is a string
      if (!participantIds.every((id) => typeof id === "string" && id.length > 0)) {
        res.status(400).json({
          error: {
            message: "Each participantId must be a non-empty string",
            code: "INVALID_PARTICIPANT_IDS",
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

      const groupChallenge = await groupChallengeService.createGroupChallenge(
        userId,
        participantIds,
        promptText,
      );

      // Fire-and-forget: check challenge_sent achievement
      achievementService
        .checkAndUnlock(userId, { type: "challenge_sent" })
        .catch(() => {});

      res.status(201).json({ groupChallenge });
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.message.includes("Need at least")) {
          res.status(400).json({
            error: {
              message: "Need at least 2 participants for a group challenge",
              code: "TOO_FEW_PARTICIPANTS",
            },
          });
          return;
        }

        if (err.message.includes("Cannot exceed")) {
          res.status(400).json({
            error: {
              message: "Cannot exceed 10 participants for a group challenge",
              code: "TOO_MANY_PARTICIPANTS",
            },
          });
          return;
        }

        if (err.message.includes("must be friends")) {
          res.status(403).json({
            error: {
              message: "All participants must be friends of the creator",
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
// GET / — List user's group challenges
// ---------------------------------------------------------------------------

groupChallengesRouter.get(
  "/",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.userId;

      const groupChallenges =
        await groupChallengeService.getUserGroupChallenges(userId);

      res.status(200).json({ groupChallenges });
    } catch (err: unknown) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /:challengeId — Get group challenge detail
// ---------------------------------------------------------------------------

groupChallengesRouter.get(
  "/:challengeId",
  async (
    req: Request<{ challengeId: string }>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const { challengeId } = req.params;

      const groupChallenge = await groupChallengeService.getGroupChallenge(
        challengeId,
        userId,
      );

      res.status(200).json({ groupChallenge });
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.message.includes("not found")) {
          res.status(404).json({
            error: {
              message: "Group challenge not found",
              code: "GROUP_CHALLENGE_NOT_FOUND",
            },
          });
          return;
        }

        if (err.message.includes("not a participant")) {
          res.status(403).json({
            error: {
              message: "You are not a participant in this group challenge",
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
// POST /:challengeId/join — Join a group challenge
// ---------------------------------------------------------------------------

groupChallengesRouter.post(
  "/:challengeId/join",
  async (
    req: Request<{ challengeId: string }>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const { challengeId } = req.params;

      const groupChallenge = await groupChallengeService.joinGroupChallenge(
        challengeId,
        userId,
      );

      res.status(200).json({ groupChallenge });
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.message.includes("not found")) {
          res.status(404).json({
            error: {
              message: "Group challenge not found",
              code: "GROUP_CHALLENGE_NOT_FOUND",
            },
          });
          return;
        }

        if (err.message.includes("not a participant")) {
          res.status(403).json({
            error: {
              message: "You are not a participant in this group challenge",
              code: "NOT_PARTICIPANT",
            },
          });
          return;
        }

        if (err.message.includes("must be 'active'")) {
          res.status(400).json({
            error: {
              message: "Group challenge is not active",
              code: "CHALLENGE_NOT_ACTIVE",
            },
          });
          return;
        }

        if (err.message.includes("must be 'pending'")) {
          res.status(400).json({
            error: {
              message: "You have already joined or resolved this challenge",
              code: "ALREADY_RESOLVED",
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
// POST /:challengeId/guess — Submit a guess for a group challenge
// ---------------------------------------------------------------------------

groupChallengesRouter.post(
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

      const groupChallenge = await groupChallengeService.submitGroupGuess(
        challengeId,
        userId,
        guessText,
      );

      // Fire-and-forget: check if the user got a high score and award XP
      const userParticipant = groupChallenge.participants.find(
        (p) => p.userId === userId,
      );

      if (userParticipant?.score != null) {
        // Award XP for group challenge participation
        xpService.awardChallengeWinXP(userId).catch(() => {});

        // Check for challenge-related achievements
        achievementService
          .checkAndUnlock(userId, { type: "challenge_won" })
          .catch(() => {});
      }

      // Fire-and-forget: record activity event
      activityFeedService
        .recordEvent(userId, "challenge_completed", {
          challengeId,
          isGroupChallenge: true,
          score: userParticipant?.score ?? null,
        })
        .catch(() => {});

      res.status(200).json({ groupChallenge });
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.message.includes("not found")) {
          res.status(404).json({
            error: {
              message: "Group challenge not found",
              code: "GROUP_CHALLENGE_NOT_FOUND",
            },
          });
          return;
        }

        if (err.message.includes("not a participant")) {
          res.status(403).json({
            error: {
              message: "You are not a participant in this group challenge",
              code: "NOT_PARTICIPANT",
            },
          });
          return;
        }

        if (
          err.message.includes("must be 'active'") ||
          err.message.includes("must be 'active' or 'scoring'")
        ) {
          res.status(400).json({
            error: {
              message: "Group challenge is not active",
              code: "CHALLENGE_NOT_ACTIVE",
            },
          });
          return;
        }

        if (err.message.includes("must be 'joined'")) {
          res.status(400).json({
            error: {
              message: "You must join the challenge before submitting a guess",
              code: "NOT_JOINED",
            },
          });
          return;
        }

        if (err.message.includes("no prompt embedding")) {
          res.status(400).json({
            error: {
              message: "Challenge is still processing. Please try again shortly.",
              code: "CHALLENGE_PROCESSING",
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
// POST /:challengeId/decline — Decline a group challenge
// ---------------------------------------------------------------------------

groupChallengesRouter.post(
  "/:challengeId/decline",
  async (
    req: Request<{ challengeId: string }>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const userId = req.user!.userId;
      const { challengeId } = req.params;

      const groupChallenge = await groupChallengeService.declineGroupChallenge(
        challengeId,
        userId,
      );

      res.status(200).json({ groupChallenge });
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.message.includes("not found")) {
          res.status(404).json({
            error: {
              message: "Group challenge not found",
              code: "GROUP_CHALLENGE_NOT_FOUND",
            },
          });
          return;
        }

        if (err.message.includes("not a participant")) {
          res.status(403).json({
            error: {
              message: "You are not a participant in this group challenge",
              code: "NOT_PARTICIPANT",
            },
          });
          return;
        }

        if (err.message.includes("Cannot decline")) {
          res.status(400).json({
            error: {
              message: "Cannot decline this challenge in its current state",
              code: "CANNOT_DECLINE",
            },
          });
          return;
        }
      }

      next(err);
    }
  },
);

export { groupChallengesRouter };
