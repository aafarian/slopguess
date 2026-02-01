/**
 * Round / game routes.
 *
 * GET  /api/rounds/active              — Current active round (public, optionalAuth)
 * POST /api/rounds/:roundId/guess      — Submit a guess (requireAuth)
 * GET  /api/rounds/:roundId            — Get a specific round (optionalAuth)
 * GET  /api/rounds/:roundId/leaderboard — Round leaderboard (public)
 */

import { Router, Request, Response, NextFunction } from "express";
import { pool } from "../config/database";
import { requireAuth, optionalAuth } from "../middleware/auth";
import { roundService } from "../services/roundService";
import { scoringService } from "../services/scoringService";
import { toPublicRound, toCompletedRound } from "../models/round";
import type { GuessRow } from "../models/guess";

const roundsRouter = Router();

// ---------------------------------------------------------------------------
// Validation helpers
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

      // Build public response — NEVER expose the prompt for active rounds
      const publicRound = toPublicRound(round);

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
          ...publicRound,
          guessCount,
        },
        ...(req.user ? { hasGuessed, userScore } : {}),
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

      // 2. Score and save the guess (service handles round existence + active check + duplicate check)
      const savedGuess = await scoringService.scoreAndSaveGuess(
        roundId,
        req.user!.userId,
        guessText
      );

      // 3. Compute rank: how many guesses scored higher + 1
      const rankResult = await pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM guesses WHERE round_id = $1 AND score > $2`,
        [roundId, savedGuess.score]
      );
      const rank = parseInt(rankResult.rows[0].count, 10) + 1;

      // 4. Get total guesses for this round
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

export { roundsRouter };
