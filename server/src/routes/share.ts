/**
 * Public share routes — served outside /api for clean share URLs.
 *
 * GET /share/:roundId/:userId — Serves an HTML page with Open Graph meta tags
 *     for social media link previews. When a bot/crawler visits, it sees the OG tags.
 *     When a human visits, the page redirects to the main application.
 *
 * These routes are intentionally lightweight and have NO authentication requirement,
 * because social media crawlers cannot authenticate.
 */

import { Router, Request, Response, NextFunction } from "express";
import { pool } from "../config/database";
import { roundService } from "../services/roundService";
import { env } from "../config/env";
import {
  isBotUserAgent,
  generateShareCardHtml,
} from "../services/shareCardService";
import type { GuessRow } from "../models/guess";

const shareRouter = Router();

// ---------------------------------------------------------------------------
// GET /:roundId/:userId — Public share page with OG meta tags
// ---------------------------------------------------------------------------

shareRouter.get(
  "/:roundId/:userId",
  async (
    req: Request<{ roundId: string; userId: string }>,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { roundId, userId } = req.params;
      const appBaseUrl = env.CORS_ORIGIN || `http://localhost:${env.PORT}`;

      // 1. Look up the round
      const round = await roundService.getRoundById(roundId);

      if (!round) {
        // Redirect to app homepage on invalid round
        res.redirect(302, appBaseUrl);
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
        // Redirect to app homepage on invalid guess
        res.redirect(302, appBaseUrl);
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

      // 5. Check if this is a bot or a human visitor
      const isBot = isBotUserAgent(req.headers["user-agent"]);

      if (isBot) {
        // Serve the full HTML with OG meta tags for crawlers
        const html = generateShareCardHtml(
          {
            username: row.username,
            score: row.score,
            rank,
            totalGuesses,
            roundImageUrl: round.imageUrl,
            roundId: round.id,
            ...(round.status === "completed" ? { prompt: round.prompt } : {}),
          },
          { appBaseUrl, userId }
        );
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.status(200).send(html);
        return;
      }

      // Human visitors — also serve HTML (with meta refresh redirect) so they
      // see a brief landing card before being sent to the app.
      const html = generateShareCardHtml(
        {
          username: row.username,
          score: row.score,
          rank,
          totalGuesses,
          roundImageUrl: round.imageUrl,
          roundId: round.id,
          ...(round.status === "completed" ? { prompt: round.prompt } : {}),
        },
        { appBaseUrl, userId }
      );
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.status(200).send(html);
    } catch (err: unknown) {
      next(err);
    }
  }
);

export { shareRouter };
