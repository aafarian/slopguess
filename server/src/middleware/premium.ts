/**
 * Premium feature gate middleware.
 *
 * - `requirePremium`      -- rejects non-Pro users with 403.
 * - `checkChallengeLimit` -- rejects free-tier users who have hit their
 *                            daily challenge limit with 429.
 *
 * Both middlewares expect `req.user` to be set (run after `requireAuth`).
 */

import { Request, Response, NextFunction } from "express";
import { env } from "../config/env";
import { subscriptionService } from "../services/subscriptionService";

/**
 * Middleware that **requires** a Pro subscription.
 * Returns 403 for free-tier users. Passes through for Pro users.
 */
async function requirePremium(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const userId = req.user!.userId;
  const tier = await subscriptionService.getUserTier(userId);

  if (tier !== "pro") {
    res.status(403).json({
      error: {
        message: "Pro subscription required",
        code: "PREMIUM_REQUIRED",
      },
    });
    return;
  }

  next();
}

/**
 * Middleware that enforces daily challenge limits for free-tier users.
 * Pro users always pass through. Free users who have exhausted their
 * daily allowance receive a 429 response with usage details.
 */
async function checkChallengeLimit(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const userId = req.user!.userId;
  const tier = await subscriptionService.getUserTier(userId);
  const isPro = tier === "pro";

  // Pro users have unlimited challenges
  if (isPro) {
    next();
    return;
  }

  const allowed = env.FREE_TIER_DAILY_CHALLENGES;
  const remaining = await subscriptionService.getRemainingChallenges(userId);
  const used = allowed - remaining;

  if (remaining <= 0) {
    res.status(429).json({
      error: {
        message: "Daily challenge limit reached",
        code: "CHALLENGE_LIMIT_EXCEEDED",
        details: {
          allowed,
          used,
          remaining,
          isPro,
        },
      },
    });
    return;
  }

  next();
}

export { requirePremium, checkChallengeLimit };
