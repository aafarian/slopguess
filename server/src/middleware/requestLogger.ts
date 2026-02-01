import crypto from "crypto";
import { Request, Response, NextFunction } from "express";
import { logger } from "../config/logger";
import { monitoringService } from "../services/monitoringService";

/**
 * Request logging middleware with request ID correlation.
 *
 * Assigns a unique UUID to each request (available as req.requestId and
 * X-Request-Id response header), then logs structured data on response finish:
 *   - requestId, method, path, statusCode, durationMs
 *
 * Format is JSON in production, human-readable in development (controlled
 * by the logger utility).
 */
function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const requestId = crypto.randomUUID();
  const start = Date.now();

  // Attach requestId to the request object for downstream use
  (req as unknown as Record<string, unknown>).requestId = requestId;

  // Set response header so clients can correlate
  res.setHeader("X-Request-Id", requestId);

  res.on("finish", () => {
    const durationMs = Date.now() - start;

    // Track request metrics for monitoring
    monitoringService.recordRequest(durationMs);

    logger.info("http", `${req.method} ${req.originalUrl} ${res.statusCode}`, {
      requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs,
    });
  });

  next();
}

export { requestLogger };
