/**
 * Subscription routes.
 *
 * GET    /api/subscriptions/status     — Current user's subscription status + premium features (requireAuth)
 * POST   /api/subscriptions/checkout   — Create Stripe Checkout session, returns URL (requireAuth)
 * POST   /api/subscriptions/portal     — Create Stripe Customer Portal session, returns URL (requireAuth)
 * POST   /api/subscriptions/webhook    — Stripe webhook endpoint (raw body, no auth)
 */

import { Router, Request, Response, NextFunction } from "express";
import express from "express";
import { requireAuth } from "../middleware/auth";
import { subscriptionService } from "../services/subscriptionService";
import { stripeService } from "../services/stripeService";
import { env, isStripeConfigured } from "../config/env";
import { logger } from "../config/logger";

const subscriptionsRouter = Router();

// ---------------------------------------------------------------------------
// GET /status — Current user's subscription status + premium features
// ---------------------------------------------------------------------------

subscriptionsRouter.get(
  "/status",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.userId;

      const [subscription, features] = await Promise.all([
        subscriptionService.getSubscription(userId),
        subscriptionService.getPremiumFeatures(userId),
      ]);

      const tier = subscription?.tier ?? "free";

      res.status(200).json({
        tier,
        features,
        subscription,
      });
    } catch (err: unknown) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /checkout — Create Stripe Checkout session
// ---------------------------------------------------------------------------

subscriptionsRouter.post(
  "/checkout",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!isStripeConfigured()) {
        res.status(503).json({
          error: {
            message: "Payment processing is not available",
            code: "STRIPE_NOT_CONFIGURED",
          },
        });
        return;
      }

      if (!env.STRIPE_PRO_PRICE_ID) {
        res.status(503).json({
          error: {
            message: "Subscription pricing is not configured",
            code: "PRICE_NOT_CONFIGURED",
          },
        });
        return;
      }

      const userId = req.user!.userId;

      const url = await stripeService.createCheckoutSession(
        userId,
        env.STRIPE_PRO_PRICE_ID,
      );

      res.status(200).json({ url });
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.message.includes("User not found")) {
          res.status(404).json({
            error: {
              message: "User not found",
              code: "USER_NOT_FOUND",
            },
          });
          return;
        }
      }

      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /portal — Create Stripe Customer Portal session
// ---------------------------------------------------------------------------

subscriptionsRouter.post(
  "/portal",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!isStripeConfigured()) {
        res.status(503).json({
          error: {
            message: "Payment processing is not available",
            code: "STRIPE_NOT_CONFIGURED",
          },
        });
        return;
      }

      const userId = req.user!.userId;

      const url = await stripeService.createCustomerPortalSession(userId);

      res.status(200).json({ url });
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.message.includes("No Stripe customer found")) {
          res.status(400).json({
            error: {
              message: "No active subscription found. Subscribe first.",
              code: "NO_SUBSCRIPTION",
            },
          });
          return;
        }
      }

      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /webhook — Stripe webhook endpoint (raw body, no auth)
// ---------------------------------------------------------------------------

subscriptionsRouter.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const signature = req.headers["stripe-signature"] as string | undefined;

      if (!signature) {
        res.status(400).json({
          error: {
            message: "Missing stripe-signature header",
            code: "MISSING_SIGNATURE",
          },
        });
        return;
      }

      await stripeService.handleWebhookEvent(req.body, signature);

      res.status(200).json({ received: true });
    } catch (err: unknown) {
      if (err instanceof Error) {
        logger.warn("subscriptions", `Webhook processing failed: ${err.message}`, {
          error: err.message,
        });

        // Stripe signature verification failures should return 400
        if (
          err.message.includes("signature") ||
          err.message.includes("webhook")
        ) {
          res.status(400).json({
            error: {
              message: "Webhook signature verification failed",
              code: "INVALID_SIGNATURE",
            },
          });
          return;
        }
      }

      next(err);
    }
  },
);

export { subscriptionsRouter };
