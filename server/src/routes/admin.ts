/**
 * Admin routes.
 *
 * Development and admin-only endpoints for managing the game.
 * No authentication is required for now (future: admin-only access).
 *
 * Endpoints:
 *   POST /api/admin/rounds/rotate  -- Manually trigger a round rotation
 *   GET  /api/admin/rounds/next    -- Get the next scheduled rotation time
 */

import { Router, Request, Response } from "express";
import { scheduler } from "../services/scheduler";

const adminRouter = Router();

/**
 * POST /api/admin/rounds/rotate
 *
 * Manually trigger a round rotation. Completes the current active round
 * (if any) and creates + activates a new one.
 */
adminRouter.post("/rounds/rotate", async (_req: Request, res: Response) => {
  try {
    await scheduler.rotateRound();
    const nextRotation = scheduler.getNextRotationTime();

    res.json({
      message: "Round rotated successfully",
      nextRotationAt: nextRotation?.toISOString() ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[admin] Manual round rotation failed:", message);
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

export { adminRouter };
