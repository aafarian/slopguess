/**
 * Health check endpoint.
 *
 * Returns detailed system health including database connectivity,
 * scheduler status, memory usage, and uptime. Used by load balancers,
 * monitoring dashboards, and operational tooling.
 *
 * Response shape:
 *   {
 *     status: "ok" | "degraded",
 *     timestamp: string,
 *     uptime: number,
 *     db: { connected: boolean },
 *     scheduler: { running: boolean, nextRotation: string | null },
 *     memory: { rss, heapUsed, heapTotal, external } (all in MB)
 *   }
 */

import { Router, Request, Response } from "express";
import { testConnection } from "../config/database";
import { scheduler } from "../services/scheduler";

const healthRouter = Router();

healthRouter.get("/", async (_req: Request, res: Response) => {
  const dbConnected = await testConnection();

  const nextRotation = scheduler.getNextRotationTime();
  const schedulerRunning = nextRotation !== null;

  const mem = process.memoryUsage();
  const toMB = (bytes: number) => Math.round((bytes / 1024 / 1024) * 100) / 100;

  const status = dbConnected ? "ok" : "degraded";
  const statusCode = dbConnected ? 200 : 503;

  res.status(statusCode).json({
    status,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    db: {
      connected: dbConnected,
    },
    scheduler: {
      running: schedulerRunning,
      nextRotation: nextRotation?.toISOString() ?? null,
    },
    memory: {
      rss: toMB(mem.rss),
      heapUsed: toMB(mem.heapUsed),
      heapTotal: toMB(mem.heapTotal),
      external: toMB(mem.external),
    },
    // Keep backward-compatible services field
    services: {
      database: dbConnected ? "connected" : "disconnected",
    },
  });
});

export { healthRouter };
