/**
 * Premium feature gate middleware.
 *
 * - `requirePremium` -- rejects non-Pro users with 403.
 *
 * Expects `req.user` to be set (run after `requireAuth`).
 */

import { Request, Response, NextFunction } from "express";
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

export { requirePremium };
