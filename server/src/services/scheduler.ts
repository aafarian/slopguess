/**
 * Round Scheduler.
 *
 * Manages automatic round rotation on a configurable interval. On startup it
 * checks for an existing active round and, if none exists, creates one. A
 * periodic interval then rotates rounds by completing the active round and
 * creating a fresh one.
 *
 * Key design decisions:
 * - Uses setInterval for v1 simplicity (no external cron library).
 * - Scheduler state (interval ID, next rotation time) lives in module scope.
 * - Idempotent on restart: detects existing active rounds.
 * - Errors during rotation are logged but never crash the server.
 * - ROUND_DURATION_HOURS controls how long a round stays active.
 * - ROUND_CHECK_INTERVAL_MINUTES controls how often we check for expiry.
 */

import { env } from "../config/env";
import { logger } from "../config/logger";
import { roundService } from "./roundService";

// ---------------------------------------------------------------------------
// Module-level scheduler state
// ---------------------------------------------------------------------------

let checkIntervalId: ReturnType<typeof setInterval> | null = null;
let nextRotationTime: Date | null = null;
let isRunning = false;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Compute when the next rotation should happen based on the active round's
 * start time plus the configured duration.
 */
function computeNextRotation(roundStartedAt: Date): Date {
  const durationMs = env.ROUND_DURATION_HOURS * 60 * 60 * 1000;
  return new Date(roundStartedAt.getTime() + durationMs);
}

/**
 * Core rotation logic executed on each check interval tick.
 *
 * 1. If there is an active round that has exceeded its duration, complete it.
 * 2. If there is a pending round, activate it.
 * 3. If no pending round exists, create a new one and activate it.
 *
 * The combination of createAndActivateRound in roundService already handles
 * completing the old round and creating + activating a new one, but we add
 * duration-based expiry checking here.
 */
async function tick(): Promise<void> {
  try {
    const activeRound = await roundService.getActiveRound();

    if (activeRound) {
      // Check if the active round has exceeded its duration
      const expiresAt = computeNextRotation(activeRound.startedAt!);
      const now = new Date();

      if (now >= expiresAt) {
        logger.info("scheduler", `Active round ${activeRound.id} has expired. Rotating...`, {
          roundId: activeRound.id,
          startedAt: activeRound.startedAt!.toISOString(),
        });
        await rotateRound();
      } else {
        // Update the next rotation time tracker
        nextRotationTime = expiresAt;
      }
    } else {
      // No active round at all -- create and activate one
      logger.info("scheduler", "No active round found. Creating and activating a new round...");
      await rotateRound();
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("scheduler", "Error during tick", { error: message });
    // Do NOT rethrow -- the scheduler must keep running
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Start the round scheduling system.
 *
 * - On first call, checks for an existing active round. If none exists,
 *   creates and activates one immediately.
 * - Sets up a periodic check interval (ROUND_CHECK_INTERVAL_MINUTES).
 * - Safe to call multiple times; subsequent calls are no-ops.
 */
async function startScheduler(): Promise<void> {
  if (isRunning) {
    logger.info("scheduler", "Scheduler is already running.");
    return;
  }

  logger.info("scheduler", "Starting scheduler", {
    roundDurationHours: env.ROUND_DURATION_HOURS,
    checkIntervalMinutes: env.ROUND_CHECK_INTERVAL_MINUTES,
  });

  isRunning = true;

  // Initial check on startup
  try {
    const activeRound = await roundService.getActiveRound();

    if (activeRound) {
      nextRotationTime = computeNextRotation(activeRound.startedAt!);
      logger.info("scheduler", `Found active round ${activeRound.id}`, {
        roundId: activeRound.id,
        nextRotation: nextRotationTime.toISOString(),
      });
    } else {
      logger.info("scheduler", "No active round on startup. Creating initial round...");
      const newRound = await roundService.createAndActivateRound();
      nextRotationTime = computeNextRotation(newRound.startedAt!);
      logger.info("scheduler", `Created initial round ${newRound.id}`, {
        roundId: newRound.id,
        nextRotation: nextRotationTime.toISOString(),
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("scheduler", "Failed to initialise active round on startup", { error: message });
    logger.warn("scheduler", "Scheduler will continue and retry on next tick.");
  }

  // Set up periodic check
  const intervalMs = env.ROUND_CHECK_INTERVAL_MINUTES * 60 * 1000;
  checkIntervalId = setInterval(() => {
    void tick();
  }, intervalMs);

  logger.info("scheduler", "Scheduler started.");
}

/**
 * Stop the scheduler (for graceful shutdown).
 */
function stopScheduler(): void {
  if (checkIntervalId !== null) {
    clearInterval(checkIntervalId);
    checkIntervalId = null;
  }
  isRunning = false;
  nextRotationTime = null;
  logger.info("scheduler", "Scheduler stopped.");
}

/**
 * Return when the next round rotation will happen.
 * Returns null if the scheduler is not running or no active round exists.
 */
function getNextRotationTime(): Date | null {
  return nextRotationTime;
}

/**
 * Manually trigger a round rotation (admin / dev use).
 *
 * Completes the currently active round (if any) and creates + activates
 * a new one, then updates the next rotation time.
 */
async function rotateRound(): Promise<void> {
  logger.info("scheduler", "Rotating round...");
  const newRound = await roundService.createAndActivateRound();
  nextRotationTime = computeNextRotation(newRound.startedAt!);
  logger.info("scheduler", `Round rotated. New active round: ${newRound.id}`, {
    roundId: newRound.id,
    nextRotation: nextRotationTime.toISOString(),
  });
}

export const scheduler = {
  startScheduler,
  stopScheduler,
  getNextRotationTime,
  rotateRound,
};
