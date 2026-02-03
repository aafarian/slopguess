/**
 * Print shop routes.
 *
 * GET    /api/print-shop/config              — Print shop feature flag status (public)
 * GET    /api/print-shop/products             — Available frame products (optionalAuth)
 * GET    /api/print-shop/quote?sku=XXX        — Price quote for a SKU (optionalAuth)
 * POST   /api/print-shop/orders               — Create a print order (requireAuth)
 * GET    /api/print-shop/orders               — List user's print orders (requireAuth)
 * GET    /api/print-shop/orders/:orderId      — Get order detail (requireAuth)
 * POST   /api/print-shop/webhook              — Prodigi webhook for order status updates (no auth)
 */

import { Router, Request, Response, NextFunction } from "express";
import { requireAuth, optionalAuth } from "../middleware/auth";
import { printOrderService } from "../services/printOrderService";
import { toPublicPrintOrder } from "../models/printOrder";
import { env } from "../config/env";
import { logger } from "../config/logger";
import type { PrintOrderStatus } from "../models/printOrder";

const printShopRouter = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** UUID v4 regex for input validation. */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Feature flag guard. Returns true (and sends 503) when the print shop is
 * disabled, meaning the caller should return early.
 */
function guardDisabled(res: Response): boolean {
  if (!env.PRINT_SHOP_ENABLED) {
    res.status(503).json({
      error: {
        message: "Print shop is not available",
        code: "PRINT_SHOP_DISABLED",
      },
    });
    return true;
  }
  return false;
}

/**
 * Map Prodigi webhook status strings to our internal PrintOrderStatus.
 */
function mapProdigiStatus(stage: string): PrintOrderStatus | null {
  switch (stage.toLowerCase()) {
    case "in progress":
      return "in_production";
    case "shipped":
      return "shipped";
    case "complete":
      return "delivered";
    case "cancelled":
      return "cancelled";
    case "failed":
      return "failed";
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// GET /config — Print shop feature flag (always responds, never gated)
// ---------------------------------------------------------------------------

printShopRouter.get(
  "/config",
  (_req: Request, res: Response): void => {
    res.status(200).json({ enabled: env.PRINT_SHOP_ENABLED });
  },
);

// ---------------------------------------------------------------------------
// GET /products — Available frame products and prices
// ---------------------------------------------------------------------------

printShopRouter.get(
  "/products",
  optionalAuth,
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (guardDisabled(res)) return;

      const products = await printOrderService.getAvailableProducts();
      res.status(200).json({ products });
    } catch (err: unknown) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /quote?sku=XXX — Price quote for a specific SKU
// ---------------------------------------------------------------------------

printShopRouter.get(
  "/quote",
  optionalAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (guardDisabled(res)) return;

      const sku = req.query.sku as string | undefined;

      if (!sku || typeof sku !== "string" || sku.trim().length === 0) {
        res.status(400).json({
          error: {
            message: "Missing or invalid 'sku' query parameter",
            code: "INVALID_SKU",
          },
        });
        return;
      }

      const quote = await printOrderService.getQuoteWithMargin(sku.trim());

      res.status(200).json({
        sku: sku.trim(),
        baseCostCents: quote.baseCostCents,
        marginCents: quote.marginCents,
        totalCostCents: quote.totalCostCents,
        currency: quote.currency,
      });
    } catch (err: unknown) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /orders — Create a new print order
// ---------------------------------------------------------------------------

printShopRouter.post(
  "/orders",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (guardDisabled(res)) return;

      const userId = req.user!.userId;
      const { roundId, sku, shippingAddress } = req.body;

      // Validate roundId
      if (!roundId || typeof roundId !== "string" || !UUID_REGEX.test(roundId)) {
        res.status(400).json({
          error: {
            message: "Missing or invalid 'roundId' (must be a valid UUID)",
            code: "INVALID_ROUND_ID",
          },
        });
        return;
      }

      // Validate sku
      if (!sku || typeof sku !== "string" || sku.trim().length === 0) {
        res.status(400).json({
          error: {
            message: "Missing or invalid 'sku'",
            code: "INVALID_SKU",
          },
        });
        return;
      }

      // Validate shippingAddress
      if (!shippingAddress || typeof shippingAddress !== "object") {
        res.status(400).json({
          error: {
            message: "Missing 'shippingAddress' object",
            code: "INVALID_SHIPPING_ADDRESS",
          },
        });
        return;
      }

      const requiredFields = ["name", "line1", "city", "postalCode", "country"] as const;
      const missingFields: string[] = [];

      for (const field of requiredFields) {
        if (
          !shippingAddress[field] ||
          typeof shippingAddress[field] !== "string" ||
          shippingAddress[field].trim().length === 0
        ) {
          missingFields.push(field);
        }
      }

      if (missingFields.length > 0) {
        res.status(400).json({
          error: {
            message: `Missing required shipping address fields: ${missingFields.join(", ")}`,
            code: "INVALID_SHIPPING_ADDRESS",
            details: { missingFields },
          },
        });
        return;
      }

      const order = await printOrderService.createOrder({
        userId,
        roundId,
        sku: sku.trim(),
        shippingAddress: {
          name: shippingAddress.name.trim(),
          line1: shippingAddress.line1.trim(),
          line2: shippingAddress.line2?.trim() || undefined,
          city: shippingAddress.city.trim(),
          state: shippingAddress.state?.trim() || undefined,
          postalCode: shippingAddress.postalCode.trim(),
          country: shippingAddress.country.trim(),
        },
      });

      // NOTE: Stripe checkout URL will be wired in Task 6.6.
      // For now, return the order without a checkout URL.
      const publicOrder = toPublicPrintOrder(order);

      res.status(201).json({
        order: publicOrder,
        checkoutUrl: null,
      });
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.message.includes("Round not found")) {
          res.status(404).json({
            error: {
              message: "Round not found",
              code: "ROUND_NOT_FOUND",
            },
          });
          return;
        }
        if (err.message.includes("does not have an image")) {
          res.status(400).json({
            error: {
              message: "This round does not have an image available for printing",
              code: "NO_IMAGE",
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
// GET /orders — List user's print orders (paginated)
// ---------------------------------------------------------------------------

printShopRouter.get(
  "/orders",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (guardDisabled(res)) return;

      const userId = req.user!.userId;
      const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
      const limit = Math.min(
        50,
        Math.max(1, parseInt(req.query.limit as string, 10) || 10),
      );

      const result = await printOrderService.getUserOrders(userId, page, limit);

      res.status(200).json({
        orders: result.orders.map(toPublicPrintOrder),
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      });
    } catch (err: unknown) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /orders/:orderId — Get order detail
// ---------------------------------------------------------------------------

printShopRouter.get(
  "/orders/:orderId",
  requireAuth,
  async (req: Request<{ orderId: string }>, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (guardDisabled(res)) return;

      const userId = req.user!.userId;
      const { orderId } = req.params;

      if (!orderId || !UUID_REGEX.test(orderId)) {
        res.status(400).json({
          error: {
            message: "Invalid order ID format",
            code: "INVALID_ORDER_ID",
          },
        });
        return;
      }

      const order = await printOrderService.getOrder(orderId, userId);

      if (!order) {
        res.status(404).json({
          error: {
            message: "Order not found",
            code: "ORDER_NOT_FOUND",
          },
        });
        return;
      }

      res.status(200).json({ order: toPublicPrintOrder(order) });
    } catch (err: unknown) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /webhook — Prodigi webhook for order status updates (no auth)
// ---------------------------------------------------------------------------

printShopRouter.post(
  "/webhook",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const event = req.body;

      if (!event || !event.event || !event.order) {
        logger.warn("printShopWebhook", "Received malformed webhook payload");
        res.status(400).json({
          error: {
            message: "Invalid webhook payload",
            code: "INVALID_PAYLOAD",
          },
        });
        return;
      }

      const prodigiOrderId = event.order.id as string | undefined;
      const statusStage = event.order.status?.stage as string | undefined;

      if (!prodigiOrderId || !statusStage) {
        logger.warn("printShopWebhook", "Webhook payload missing order ID or status", {
          event: event.event,
        });
        res.status(400).json({
          error: {
            message: "Missing order ID or status in webhook payload",
            code: "INVALID_PAYLOAD",
          },
        });
        return;
      }

      const mappedStatus = mapProdigiStatus(statusStage);

      if (!mappedStatus) {
        logger.info("printShopWebhook", "Ignoring unrecognized Prodigi status", {
          prodigiOrderId,
          stage: statusStage,
        });
        res.status(200).json({ received: true });
        return;
      }

      logger.info("printShopWebhook", "Processing status update", {
        prodigiOrderId,
        stage: statusStage,
        mappedStatus,
      });

      await printOrderService.updateOrderStatus(prodigiOrderId, mappedStatus);

      res.status(200).json({ received: true });
    } catch (err: unknown) {
      if (err instanceof Error) {
        logger.warn("printShopWebhook", `Webhook processing failed: ${err.message}`, {
          error: err.message,
        });
      }
      next(err);
    }
  },
);

export { printShopRouter };
