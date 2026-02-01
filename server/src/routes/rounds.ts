/**
 * Round / game routes.
 *
 * GET  /api/rounds/active              — Current active round (public, optionalAuth)
 * GET  /api/rounds/history             — Completed rounds list (public, paginated)
 * POST /api/rounds/:roundId/guess      — Submit a guess (requireAuth)
 * GET  /api/rounds/:roundId            — Get a specific round (optionalAuth)
 * GET  /api/rounds/:roundId/leaderboard — Round leaderboard (public)
 * GET  /api/rounds/:roundId/share/:userId — Public shareable score data (no auth)
 * GET  /api/rounds/:roundId/results    — Full results for a completed round (optionalAuth)
 */

import { Router, Request, Response, NextFunction } from "express";
import { pool } from "../config/database";
import { requireAuth, optionalAuth } from "../middleware/auth";
import { guessLimiter } from "../middleware/rateLimiter";
import { roundService } from "../services/roundService";
import { scoringService } from "../services/scoringService";
import { leaderboardService } from "../services/leaderboardService";
import { streakService } from "../services/streakService";
import { logger } from "../config/logger";
import { containsBlockedContent } from "../services/contentFilter";
import { toPublicRound, toCompletedRound } from "../models/round";
import type { GuessRow } from "../models/guess";
import type { ElementScoreBreakdown } from "../models/guess";

const roundsRouter = Router();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum length for guess text. */
const MAX_GUESS_LENGTH = 200;

// ---------------------------------------------------------------------------
// GET /active — Get the current active round
// ---------------------------------------------------------------------------

roundsRouter.get(
  "/active",
  optionalAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const round = await roundService.getActiveRound();

      if (!round) {
        res.status(404).json({
          error: { message: "No active round", code: "NO_ACTIVE_ROUND" },
        });
        return;
      }

      // Add guess count
      const countResult = await pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM guesses WHERE round_id = $1`,
        [round.id]
      );
      const guessCount = parseInt(countResult.rows[0].count, 10);

      // If user is authenticated, check if they've already guessed
      let hasGuessed = false;
      let userScore: number | null = null;

      if (req.user) {
        const guessResult = await pool.query<{ score: number }>(
          `SELECT score FROM guesses WHERE round_id = $1 AND user_id = $2`,
          [round.id, req.user.userId]
        );

        if (guessResult.rows.length > 0) {
          hasGuessed = true;
          userScore = guessResult.rows[0].score;
        }
      }

      res.status(200).json({
        round: {
          ...toPublicRound(round),
          guessCount,
        },
        ...(req.user ? {
          hasGuessed,
          userScore,
        } : {}),
      });
    } catch (err: unknown) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /history — List completed rounds (paginated)
// ---------------------------------------------------------------------------

roundsRouter.get(
  "/history",
  optionalAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string, 10) || 10));

      const { rounds, total } = await roundService.getCompletedRoundsPaginated(page, limit);

      // Build response with basic info + guess counts and top score per round
      const roundsWithStats = await Promise.all(
        rounds.map(async (round) => {
          const stats = await leaderboardService.getRoundStats(round.id);
          return {
            id: round.id,
            imageUrl: round.imageUrl,
            prompt: round.prompt,
            startedAt: round.startedAt ? round.startedAt.toISOString() : null,
            endedAt: round.endedAt ? round.endedAt.toISOString() : null,
            totalGuesses: stats?.totalGuesses ?? 0,
            topScore: stats?.highestScore ?? null,
          };
        })
      );

      const totalPages = Math.ceil(total / limit);

      res.status(200).json({
        rounds: roundsWithStats,
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
// POST /:roundId/guess — Submit a guess for a round
// ---------------------------------------------------------------------------

roundsRouter.post(
  "/:roundId/guess",
  guessLimiter,
  requireAuth,
  async (req: Request<{ roundId: string }>, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { roundId } = req.params;
      const { guess } = req.body as { guess?: string };

      // 1. Validate input
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

      // 1b. Content filter
      if (containsBlockedContent(guessText)) {
        res.status(400).json({
          error: {
            message: "Your guess contains inappropriate language. Please try again.",
            code: "INAPPROPRIATE_CONTENT",
          },
        });
        return;
      }

      // 2. Score and save the guess (service handles round existence + active check + duplicate check)
      const savedGuess = await scoringService.scoreAndSaveGuess(
        roundId,
        req.user!.userId,
        guessText
      );

      // 3. Fire-and-forget: record the play for streak tracking
      if (req.user) {
        streakService.recordPlay(req.user.userId).catch((streakErr: unknown) => {
          const msg = streakErr instanceof Error ? streakErr.message : String(streakErr);
          logger.error("rounds", `Failed to record streak for user ${req.user!.userId}`, {
            userId: req.user!.userId,
            error: msg,
          });
        });
      }

      // 4. Compute rank: how many guesses scored higher + 1
      const rankResult = await pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM guesses WHERE round_id = $1 AND score > $2`,
        [roundId, savedGuess.score]
      );
      const rank = parseInt(rankResult.rows[0].count, 10) + 1;

      // 5. Get total guesses for this round
      const totalResult = await pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM guesses WHERE round_id = $1`,
        [roundId]
      );
      const totalGuesses = parseInt(totalResult.rows[0].count, 10);

      res.status(201).json({
        guessId: savedGuess.id,
        score: savedGuess.score,
        rank,
        totalGuesses,
      });
    } catch (err: unknown) {
      // Map service-level errors to proper HTTP status codes
      if (err instanceof Error) {
        if (err.message.includes("Round not found")) {
          res.status(404).json({
            error: { message: "Round not found", code: "ROUND_NOT_FOUND" },
          });
          return;
        }

        if (err.message.includes("must be 'active'")) {
          res.status(400).json({
            error: {
              message: "Round is not active",
              code: "ROUND_NOT_ACTIVE",
            },
          });
          return;
        }

        if (err.message.includes("already submitted a guess")) {
          res.status(409).json({
            error: {
              message: "You have already submitted a guess for this round",
              code: "DUPLICATE_GUESS",
            },
          });
          return;
        }
      }

      // Also handle DB unique constraint violation as a fallback
      const pgErr = err as { code?: string };
      if (pgErr.code === "23505") {
        res.status(409).json({
          error: {
            message: "You have already submitted a guess for this round",
            code: "DUPLICATE_GUESS",
          },
        });
        return;
      }

      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /:roundId — Get a specific round
// ---------------------------------------------------------------------------

roundsRouter.get(
  "/:roundId",
  optionalAuth,
  async (req: Request<{ roundId: string }>, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { roundId } = req.params;
      const round = await roundService.getRoundById(roundId);

      if (!round) {
        res.status(404).json({
          error: { message: "Round not found", code: "ROUND_NOT_FOUND" },
        });
        return;
      }

      // Completed rounds reveal the prompt; active/pending rounds do not
      const roundData =
        round.status === "completed"
          ? toCompletedRound(round)
          : toPublicRound(round);

      // If user is authenticated, include their guess info
      let userGuess: { guessText: string; score: number | null; submittedAt: string } | null = null;

      if (req.user) {
        const guessResult = await pool.query<GuessRow>(
          `SELECT * FROM guesses WHERE round_id = $1 AND user_id = $2`,
          [roundId, req.user.userId]
        );

        if (guessResult.rows.length > 0) {
          const row = guessResult.rows[0];
          userGuess = {
            guessText: row.guess_text,
            score: row.score,
            submittedAt:
              row.submitted_at instanceof Date
                ? row.submitted_at.toISOString()
                : String(row.submitted_at),
          };
        }
      }

      res.status(200).json({
        round: roundData,
        ...(req.user ? { userGuess } : {}),
      });
    } catch (err: unknown) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /:roundId/leaderboard — Get round leaderboard
// ---------------------------------------------------------------------------

roundsRouter.get(
  "/:roundId/leaderboard",
  async (req: Request<{ roundId: string }>, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { roundId } = req.params;

      // Verify round exists
      const round = await roundService.getRoundById(roundId);

      if (!round) {
        res.status(404).json({
          error: { message: "Round not found", code: "ROUND_NOT_FOUND" },
        });
        return;
      }

      // Get all scores for the round (ordered by score DESC)
      const scores = await scoringService.getRoundScores(roundId);

      if (round.status === "completed") {
        // Round is completed — reveal full data including guess text
        res.status(200).json({
          roundId: round.id,
          status: round.status,
          leaderboard: scores.map((s, index) => ({
            rank: index + 1,
            userId: s.userId,
            username: s.username,
            guessText: s.guessText,
            score: s.score,
            submittedAt: s.submittedAt,
          })),
        });
      } else {
        // Round is active — only show scores and usernames (no guess text)
        res.status(200).json({
          roundId: round.id,
          status: round.status,
          leaderboard: scores.map((s, index) => ({
            rank: index + 1,
            userId: s.userId,
            username: s.username,
            score: s.score,
            submittedAt: s.submittedAt,
          })),
        });
      }
    } catch (err: unknown) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /:roundId/share/:userId — Public shareable score data
// ---------------------------------------------------------------------------

roundsRouter.get(
  "/:roundId/share/:userId",
  async (
    req: Request<{ roundId: string; userId: string }>,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { roundId, userId } = req.params;

      // 1. Look up the round
      const round = await roundService.getRoundById(roundId);

      if (!round) {
        res.status(404).json({
          error: { message: "Round not found", code: "ROUND_NOT_FOUND" },
        });
        return;
      }

      // 2. Look up the user's guess for this round (join with users for username)
      const guessResult = await pool.query<GuessRow & { username: string }>(
        `SELECT g.*, u.username
         FROM guesses g
         JOIN users u ON u.id = g.user_id
         WHERE g.round_id = $1 AND g.user_id = $2`,
        [roundId, userId]
      );

      if (guessResult.rows.length === 0) {
        res.status(404).json({
          error: { message: "Guess not found", code: "GUESS_NOT_FOUND" },
        });
        return;
      }

      const row = guessResult.rows[0];

      // 3. Compute rank (COUNT of higher scores + 1)
      const rankResult = await pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM guesses WHERE round_id = $1 AND score > $2`,
        [roundId, row.score]
      );
      const rank = parseInt(rankResult.rows[0].count, 10) + 1;

      // 4. Total guesses for this round
      const totalResult = await pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM guesses WHERE round_id = $1`,
        [roundId]
      );
      const totalGuesses = parseInt(totalResult.rows[0].count, 10);

      // 5. Build response — only include prompt if round is completed
      const shareData: Record<string, unknown> = {
        username: row.username,
        score: row.score,
        rank,
        totalGuesses,
        roundImageUrl: round.imageUrl,
        roundId: round.id,
      };

      if (round.status === "completed") {
        shareData.prompt = round.prompt;
      }

      res.status(200).json(shareData);
    } catch (err: unknown) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// GET /:roundId/results — Full results for a completed round
// ---------------------------------------------------------------------------

roundsRouter.get(
  "/:roundId/results",
  optionalAuth,
  async (req: Request<{ roundId: string }>, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { roundId } = req.params;

      // 1. Verify round exists
      const round = await roundService.getRoundById(roundId);

      if (!round) {
        res.status(404).json({
          error: { message: "Round not found", code: "ROUND_NOT_FOUND" },
        });
        return;
      }

      // 2. Only allow results for completed rounds
      if (round.status !== "completed") {
        res.status(400).json({
          error: {
            message: "Results are only available for completed rounds",
            code: "ROUND_NOT_COMPLETED",
          },
        });
        return;
      }

      // 3. Get full leaderboard (base entries from leaderboardService)
      const leaderboard = await leaderboardService.getLeaderboard(roundId);

      // 3b. Fetch element_scores for all guesses in this round to augment leaderboard entries
      const elementScoresResult = await pool.query<{
        user_id: string;
        element_scores: Record<string, unknown> | null;
      }>(
        `SELECT user_id, element_scores FROM guesses WHERE round_id = $1`,
        [roundId]
      );
      const elementScoresMap = new Map<string, ElementScoreBreakdown | null>();
      for (const row of elementScoresResult.rows) {
        elementScoresMap.set(
          row.user_id,
          row.element_scores as ElementScoreBreakdown | null
        );
      }

      // 4. Get round stats
      const stats = await leaderboardService.getRoundStats(roundId);

      // 5. If user is authenticated, include their rank
      let userResult: {
        guessText: string;
        score: number | null;
        elementScores: ElementScoreBreakdown | null;
        rank: number;
        total: number;
      } | null = null;

      if (req.user) {
        const userRank = await leaderboardService.getUserRank(roundId, req.user.userId);
        if (userRank) {
          // Find user's guess in the leaderboard
          const userEntry = leaderboard.find((e) => e.userId === req.user!.userId);
          if (userEntry) {
            userResult = {
              guessText: userEntry.guessText,
              score: userEntry.score,
              elementScores: elementScoresMap.get(req.user!.userId) ?? null,
              rank: userRank.rank,
              total: userRank.total,
            };
          }
        }
      }

      res.status(200).json({
        round: {
          ...toCompletedRound(round),
        },
        leaderboard: leaderboard.map((entry) => ({
          rank: entry.rank,
          userId: entry.userId,
          username: entry.username,
          guessText: entry.guessText,
          score: entry.score,
          elementScores: elementScoresMap.get(entry.userId) ?? null,
          submittedAt: entry.submittedAt,
        })),
        stats: stats ?? {
          totalGuesses: 0,
          averageScore: 0,
          highestScore: 0,
          lowestScore: 0,
        },
        ...(req.user ? { userResult } : {}),
      });
    } catch (err: unknown) {
      next(err);
    }
  }
);

export { roundsRouter };
