/**
 * Rate limiting middleware using express-rate-limit.
 *
 * Three tiers:
 *   - generalLimiter  — configurable via RATE_LIMIT_MAX / RATE_LIMIT_WINDOW_MS
 *   - authLimiter     — 5 requests per 1 minute  (applied to /api/auth)
 *   - guessLimiter    — 10 requests per 1 minute (applied to guess endpoint)
 *
 * The general limiter window and max are configurable via environment variables
 * (RATE_LIMIT_WINDOW_MS and RATE_LIMIT_MAX). Auth and guess limiters use the
 * same window but with stricter maximums.
 *
 * All limiters use the default in-memory store which is sufficient for
 * single-process deployments. Upgrade to a Redis-backed store when
 * horizontal scaling is needed.
 */

import rateLimit from "express-rate-limit";
import { env } from "../config/env";

const isTest = process.env.NODE_ENV === "test";

/** In test mode, set limits high enough to avoid interfering with test suites. */
const testMax = 10000;

/**
 * General API rate limiter.
 * Applied globally to all /api routes.
 * Defaults: 100 requests per 15 minutes (900000ms) per IP.
 * Configurable via RATE_LIMIT_MAX and RATE_LIMIT_WINDOW_MS env vars.
 */
export const generalLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: isTest ? testMax : env.RATE_LIMIT_MAX,
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
 * 5 requests per 1 minute per IP.
 */
export const authLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute (always fixed)
  max: isTest ? testMax : 5,
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
  windowMs: 1 * 60 * 1000, // 1 minute (always fixed)
  max: isTest ? testMax : 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      message: "Too many guess submissions, please try again later.",
      code: "GUESS_RATE_LIMIT_EXCEEDED",
    },
  },
});
