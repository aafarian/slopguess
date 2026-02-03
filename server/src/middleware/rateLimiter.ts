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

import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { Request } from "express";
import { env } from "../config/env";

const isTest = process.env.NODE_ENV === "test";

/** In test mode, set limits high enough to avoid interfering with test suites. */
const testMax = 10000;

/**
 * General API rate limiter.
 * Applied globally to all /api routes.
 * Defaults: 1000 requests per 15 minutes (900000ms) per IP.
 * Configurable via RATE_LIMIT_MAX and RATE_LIMIT_WINDOW_MS env vars.
 *
 * Per-IP isolation model:
 *   - Uses req.ip as the rate limit key so each client IP gets its own counter.
 *   - When TRUST_PROXY=true is set in env (which calls app.set("trust proxy", 1)
 *     in app.ts), req.ip is derived from the X-Forwarded-For header. This is
 *     required when running behind nginx or a load balancer so that all clients
 *     are not bucketed under the proxy's IP address.
 *   - The default in-memory store maintains counters per process. Each IP gets
 *     an independent counter; one client's usage does not affect another's budget.
 *   - To verify isolation: different source IPs should receive independent
 *     RateLimit-Remaining values in the RateLimit-* response headers.
 */
export const generalLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: isTest ? testMax : env.RATE_LIMIT_MAX,
  standardHeaders: true, // Return rate limit info in RateLimit-* headers
  legacyHeaders: false, // Disable X-RateLimit-* headers
  // Explicit keyGenerator to make per-IP isolation auditable.
  // express-rate-limit defaults to req.ip, but being explicit prevents
  // accidental override and documents the intended behavior.
  // ipKeyGenerator collapses IPv6 addresses to /56 subnets to prevent bypass.
  keyGenerator: (req: Request) => ipKeyGenerator(req.ip || "unknown"),
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
