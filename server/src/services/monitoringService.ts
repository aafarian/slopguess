/**
 * In-memory monitoring service.
 *
 * Tracks basic application metrics that accumulate in memory and reset on
 * restart. Designed to be called from request middleware (requestLogger,
 * errorHandler) without adding external dependencies.
 *
 * Exposed counters:
 *   - requestCount: total HTTP requests handled
 *   - errorCount: total errors processed by the error handler
 *   - totalResponseTimeMs: cumulative response time for average calculation
 *   - lastRoundRotationTime: timestamp of the most recent round rotation
 */

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

let requestCount = 0;
let errorCount = 0;
let totalResponseTimeMs = 0;
let lastRoundRotationTime: Date | null = null;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Record a completed request with its response time.
 */
function recordRequest(durationMs: number): void {
  requestCount++;
  totalResponseTimeMs += durationMs;
}

/**
 * Record an error processed by the error handler.
 */
function recordError(): void {
  errorCount++;
}

/**
 * Record the time of the most recent round rotation.
 */
function recordRoundRotation(): void {
  lastRoundRotationTime = new Date();
}

/**
 * Get a snapshot of all current metrics.
 */
function getMetrics(): {
  requestCount: number;
  errorCount: number;
  avgResponseTimeMs: number;
  uptime: number;
  lastRoundRotationTime: string | null;
} {
  const avgResponseTimeMs =
    requestCount > 0
      ? Math.round((totalResponseTimeMs / requestCount) * 100) / 100
      : 0;

  return {
    requestCount,
    errorCount,
    avgResponseTimeMs,
    uptime: process.uptime(),
    lastRoundRotationTime: lastRoundRotationTime?.toISOString() ?? null,
  };
}

/**
 * Reset all metrics to initial values (useful for testing).
 */
function resetMetrics(): void {
  requestCount = 0;
  errorCount = 0;
  totalResponseTimeMs = 0;
  lastRoundRotationTime = null;
}

export const monitoringService = {
  recordRequest,
  recordError,
  recordRoundRotation,
  getMetrics,
  resetMetrics,
};
