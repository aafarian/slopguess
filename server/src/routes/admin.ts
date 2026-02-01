/**
 * Admin routes.
 *
 * Development and admin-only endpoints for managing the game.
 * No authentication is required for now (future: admin-only access).
 *
 * Endpoints:
 *   POST /api/admin/rounds/rotate            -- Manually trigger a round rotation
 *   GET  /api/admin/rounds/next              -- Get the next scheduled rotation time
 *   GET  /api/admin/prompt-variety/report     -- Prompt variety overlap statistics
 *   GET  /api/admin/metrics                  -- In-memory application metrics
 */

import { Router, Request, Response } from "express";
import { pool } from "../config/database";
import { logger } from "../config/logger";
import { scheduler } from "../services/scheduler";
import { promptVarietyService } from "../services/promptVarietyService";
import { monitoringService } from "../services/monitoringService";

const adminRouter = Router();

/**
 * POST /api/admin/rounds/rotate
 *
 * Manually trigger a round rotation. Completes the current active round
 * (if any) and creates + activates a new one.
 */
adminRouter.post("/rounds/rotate", async (req: Request, res: Response) => {
  try {
    const { difficulty } = req.body as { difficulty?: string };
    await scheduler.rotateRound(difficulty);
    const nextRotation = scheduler.getNextRotationTime();

    res.json({
      message: "Round rotated successfully",
      difficulty: difficulty ?? "default",
      nextRotationAt: nextRotation?.toISOString() ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("admin", "Manual round rotation failed", { error: message });
    res.status(500).json({
      error: {
        message: "Failed to rotate round",
        code: "ROTATION_FAILED",
        details: message,
      },
    });
  }
});

/**
 * GET /api/admin/rounds/next
 *
 * Returns the next scheduled rotation time. Useful for debugging
 * and for a frontend countdown display.
 */
adminRouter.get("/rounds/next", (_req: Request, res: Response) => {
  const nextRotation = scheduler.getNextRotationTime();

  res.json({
    nextRotationAt: nextRotation?.toISOString() ?? null,
    schedulerRunning: nextRotation !== null,
  });
});

/**
 * GET /api/admin/prompt-variety/report
 *
 * Returns overlap statistics for the last N rounds' word combinations.
 * Shows per-round breakdown and aggregate metrics for monitoring
 * prompt variety (NFR-002).
 *
 * Query params:
 *   ?lookback=30  -- Number of recent rounds to analyze (default: 30)
 */
adminRouter.get(
  "/prompt-variety/report",
  async (req: Request, res: Response) => {
    const lookback = Math.min(
      Math.max(parseInt(req.query.lookback as string, 10) || 30, 1),
      100
    );

    const report = await promptVarietyService.getVarietyReport(lookback);

    res.json({
      ...report,
      config: {
        lookbackWindow: promptVarietyService.LOOKBACK_ROUNDS,
        maxOverlapRatio: promptVarietyService.MAX_OVERLAP_RATIO,
      },
    });
  }
);

/**
 * GET /api/admin/metrics
 *
 * Returns in-memory application metrics: request count, error count,
 * average response time, and uptime. Metrics accumulate since last
 * server restart.
 */
adminRouter.get("/metrics", (_req: Request, res: Response) => {
  const metrics = monitoringService.getMetrics();

  res.json({
    requestCount: metrics.requestCount,
    errorCount: metrics.errorCount,
    avgResponseTimeMs: metrics.avgResponseTimeMs,
    uptime: metrics.uptime,
    lastRoundRotationTime: metrics.lastRoundRotationTime,
  });
});

/**
 * GET /api/admin/prompt-sources
 *
 * Returns a breakdown of prompt sources (llm vs template) across all rounds.
 */
adminRouter.get("/prompt-sources", async (_req: Request, res: Response) => {
  try {
    const result = await pool.query<{ prompt_source: string; count: string }>(
      `SELECT prompt_source, COUNT(*) AS count FROM rounds GROUP BY prompt_source`
    );

    const sources: Record<string, number> = { llm: 0, template: 0 };
    for (const row of result.rows) {
      const key = row.prompt_source ?? "template";
      sources[key] = parseInt(row.count, 10);
    }

    res.json({ sources });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("admin", "Failed to fetch prompt source breakdown", { error: message });
    res.status(500).json({
      error: {
        message: "Failed to fetch prompt source breakdown",
        code: "PROMPT_SOURCES_FAILED",
      },
    });
  }
});

export { adminRouter };
