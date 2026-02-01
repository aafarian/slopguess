/**
 * Rate limiting middleware using express-rate-limit.
 *
 * Four tiers:
 *   - generalLimiter   — configurable via RATE_LIMIT_MAX / RATE_LIMIT_WINDOW_MS
 *   - loginLimiter     — 10 requests per 1 minute (POST /login only)
 *   - registerLimiter  — 5 requests per 1 minute  (POST /register only)
 *   - guessLimiter     — 10 requests per 1 minute (POST guess endpoint)
 *
 * Login and register have separate instances so their budgets are independent.
 * GET /me has no dedicated limiter — only the general limiter applies.
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
 * Login rate limiter.
 * Separate instance from register — registration attempts don't eat into login budget.
 * 10 requests per 1 minute per IP.
 */
export const loginLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: isTest ? testMax : 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      message: "Too many login attempts, please try again later.",
      code: "LOGIN_RATE_LIMIT_EXCEEDED",
    },
  },
});

/**
 * Registration rate limiter.
 * Separate instance from login — login attempts don't eat into registration budget.
 * 5 requests per 1 minute per IP.
 */
export const registerLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: isTest ? testMax : 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      message: "Too many registration attempts, please try again later.",
      code: "REGISTER_RATE_LIMIT_EXCEEDED",
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
