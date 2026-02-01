/**
 * Rate limiting middleware using express-rate-limit.
 *
 * Three tiers:
 *   - generalLimiter  — 100 requests per 15 minutes (applied globally)
 *   - authLimiter     — 20 requests per 15 minutes  (applied to /api/auth)
 *   - guessLimiter    — 10 requests per 1 minute     (applied to guess endpoint)
 *
 * All limiters use the default in-memory store which is sufficient for
 * single-process deployments. Upgrade to a Redis-backed store when
 * horizontal scaling is needed.
 */

import rateLimit from "express-rate-limit";

/**
 * General API rate limiter.
 * Applied globally to all /api routes.
 * 100 requests per 15 minutes per IP.
 */
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true, // Return rate limit info in RateLimit-* headers
  legacyHeaders: false, // Disable X-RateLimit-* headers
  message: {
    error: {
      message: "Too many requests, please try again later.",
      code: "RATE_LIMIT_EXCEEDED",
    },
  },
});

/**
 * Auth route rate limiter (stricter).
 * Applied to /api/auth routes (login, register).
 * 20 requests per 15 minutes per IP.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      message: "Too many authentication attempts, please try again later.",
      code: "AUTH_RATE_LIMIT_EXCEEDED",
    },
  },
});

/**
 * Guess submission rate limiter.
 * Applied to the POST /api/rounds/:roundId/guess endpoint.
 * 10 requests per 1 minute per IP.
 */
export const guessLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      message: "Too many guess submissions, please try again later.",
      code: "GUESS_RATE_LIMIT_EXCEEDED",
    },
  },
});
