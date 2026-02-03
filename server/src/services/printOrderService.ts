/**
 * Print order business logic service.
 *
 * Orchestrates the full lifecycle of print shop orders: product listing,
 * pricing with margin, order creation, payment confirmation, status updates,
 * and user order queries.
 *
 * All pricing is in cents (integer math) to avoid floating-point issues.
 * Margin calculation: marginCents = round(baseCostCents * PRINT_SHOP_MARGIN_PERCENT / 100)
 */

import { pool } from "../config/database";
import { env } from "../config/env";
import { logger } from "../config/logger";
import type {
  PrintOrderRow,
  PrintOrder,
  PrintOrderStatus,
} from "../models/printOrder";
import { toPrintOrder } from "../models/printOrder";
import type {
  ProdigiProduct,
  ShippingAddress,
} from "./prodigiService";
import { prodigiService } from "./prodigiService";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Parameters for creating a new print order. */
export interface CreatePrintOrderParams {
  userId: string;
  roundId: string;
  sku: string;
  shippingAddress: ShippingAddress;
}

/** Price quote with margin applied. */
export interface QuoteWithMargin {
  baseCostCents: number;
  marginCents: number;
  totalCostCents: number;
  currency: string;
}

// ---------------------------------------------------------------------------
// Service methods
// ---------------------------------------------------------------------------

/**
 * Fetch the list of available framed print products from Prodigi.
 */
async function getAvailableProducts(): Promise<ProdigiProduct[]> {
  logger.info("printOrderService", "Fetching available products");
  return prodigiService.getProducts();
}

/**
 * Get a price quote for a given SKU with the configured margin applied.
 *
 * Margin calculation uses integer math:
 *   marginCents = Math.round(baseCostCents * (PRINT_SHOP_MARGIN_PERCENT / 100))
 *   totalCostCents = baseCostCents + marginCents
 */
async function getQuoteWithMargin(sku: string): Promise<QuoteWithMargin> {
  logger.info("printOrderService", "Getting quote with margin", { sku });

  const quote = await prodigiService.getQuote(sku, 1);

  const baseCostCents = quote.costCents;
  const marginCents = Math.round(
    baseCostCents * (env.PRINT_SHOP_MARGIN_PERCENT / 100)
  );
  const totalCostCents = baseCostCents + marginCents;

  logger.info("printOrderService", "Quote calculated", {
    sku,
    baseCostCents,
    marginCents,
    totalCostCents,
    currency: quote.currency,
  });

  return {
    baseCostCents,
    marginCents,
    totalCostCents,
    currency: quote.currency,
  };
}

/**
 * Create a new print order.
 *
 * Validates that the referenced round exists and has a non-null imageUrl,
 * calculates pricing with margin, and inserts a new order row with status 'pending'.
 */
async function createOrder(params: CreatePrintOrderParams): Promise<PrintOrder> {
  const { userId, roundId, sku, shippingAddress } = params;

  logger.info("printOrderService", "Creating order", { userId, roundId, sku });

  // Validate round exists and has an image
  const roundResult = await pool.query<{ id: string; image_url: string | null }>(
    `SELECT id, image_url FROM rounds WHERE id = $1`,
    [roundId]
  );

  if (roundResult.rows.length === 0) {
    throw new Error(`Round not found: ${roundId}`);
  }

  const round = roundResult.rows[0];

  if (!round.image_url) {
    throw new Error(
      `Round ${roundId} does not have an image and cannot be printed`
    );
  }

  // Get pricing
  const quote = await getQuoteWithMargin(sku);

  // Insert order into database
  const insertQuery = `
    INSERT INTO print_orders (
      user_id, round_id, sku, quantity,
      base_cost_cents, margin_cents, total_cost_cents, currency,
      status,
      shipping_name, shipping_line1, shipping_line2,
      shipping_city, shipping_state, shipping_postal_code, shipping_country,
      image_url
    )
    VALUES (
      $1, $2, $3, $4,
      $5, $6, $7, $8,
      $9,
      $10, $11, $12,
      $13, $14, $15, $16,
      $17
    )
    RETURNING *
  `;

  const result = await pool.query<PrintOrderRow>(insertQuery, [
    userId,
    roundId,
    sku,
    1, // quantity
    quote.baseCostCents,
    quote.marginCents,
    quote.totalCostCents,
    quote.currency,
    "pending" as PrintOrderStatus,
    shippingAddress.name,
    shippingAddress.line1,
    shippingAddress.line2 || null,
    shippingAddress.city,
    shippingAddress.state || null,
    shippingAddress.postalCode,
    shippingAddress.country,
    round.image_url,
  ]);

  const order = toPrintOrder(result.rows[0]);

  logger.info("printOrderService", "Order created", {
    orderId: order.id,
    userId,
    roundId,
    totalCostCents: order.totalCostCents,
  });

  return order;
}

/**
 * Confirm payment for an order and submit it to Prodigi.
 *
 * 1. Updates the order status to 'paid' and stores the Stripe payment intent ID.
 * 2. Submits the order to Prodigi for fulfillment.
 * 3. Updates the order status to 'submitted' with the Prodigi order ID.
 *
 * If Prodigi submission fails, the order remains in 'paid' status for retry.
 */
async function confirmPayment(
  orderId: string,
  stripePaymentIntentId: string
): Promise<PrintOrder> {
  logger.info("printOrderService", "Confirming payment", {
    orderId,
    stripePaymentIntentId,
  });

  // Step 1: Mark as paid
  const paidResult = await pool.query<PrintOrderRow>(
    `UPDATE print_orders
     SET status = 'paid',
         stripe_payment_intent_id = $2,
         updated_at = NOW()
     WHERE id = $1 AND status = 'pending'
     RETURNING *`,
    [orderId, stripePaymentIntentId]
  );

  if (paidResult.rows.length === 0) {
    throw new Error(
      `Cannot confirm payment for order ${orderId}: order not found or not in 'pending' status`
    );
  }

  const paidOrder = toPrintOrder(paidResult.rows[0]);

  // Step 2: Submit to Prodigi
  try {
    const prodigiResult = await prodigiService.createOrder({
      imageUrl: paidOrder.imageUrl,
      sku: paidOrder.sku,
      quantity: paidOrder.quantity,
      shippingAddress: {
        name: paidOrder.shippingName,
        line1: paidOrder.shippingLine1,
        line2: paidOrder.shippingLine2 || undefined,
        city: paidOrder.shippingCity,
        state: paidOrder.shippingState || undefined,
        postalCode: paidOrder.shippingPostalCode,
        country: paidOrder.shippingCountry,
      },
      idempotencyKey: orderId,
    });

    // Step 3: Mark as submitted with Prodigi order ID
    const submittedResult = await pool.query<PrintOrderRow>(
      `UPDATE print_orders
       SET status = 'submitted',
           prodigi_order_id = $2,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [orderId, prodigiResult.orderId]
    );

    const submittedOrder = toPrintOrder(submittedResult.rows[0]);

    logger.info("printOrderService", "Order submitted to Prodigi", {
      orderId,
      prodigiOrderId: prodigiResult.orderId,
    });

    return submittedOrder;
  } catch (err) {
    // Order stays in 'paid' status so it can be retried
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      "printOrderService",
      "Failed to submit order to Prodigi (order remains in paid status)",
      { orderId, error: message }
    );
    throw new Error(
      `Order ${orderId} payment confirmed but Prodigi submission failed: ${message}`
    );
  }
}

/**
 * Update order status based on a Prodigi webhook callback.
 *
 * Looks up the order by its Prodigi order ID and sets the new status.
 */
async function updateOrderStatus(
  prodigiOrderId: string,
  status: PrintOrderStatus
): Promise<PrintOrder | null> {
  logger.info("printOrderService", "Updating order status from webhook", {
    prodigiOrderId,
    status,
  });

  const result = await pool.query<PrintOrderRow>(
    `UPDATE print_orders
     SET status = $2,
         updated_at = NOW()
     WHERE prodigi_order_id = $1
     RETURNING *`,
    [prodigiOrderId, status]
  );

  if (result.rows.length === 0) {
    logger.warn("printOrderService", "No order found for Prodigi order ID", {
      prodigiOrderId,
    });
    return null;
  }

  const order = toPrintOrder(result.rows[0]);

  logger.info("printOrderService", "Order status updated", {
    orderId: order.id,
    prodigiOrderId,
    status,
  });

  return order;
}

/**
 * Get paginated list of print orders for a user.
 *
 * Returns orders with pagination metadata following the existing
 * { page, limit, total, totalPages } pattern.
 */
async function getUserOrders(
  userId: string,
  page: number = 1,
  limit: number = 10
): Promise<{
  orders: PrintOrder[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}> {
  const offset = (page - 1) * limit;

  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM print_orders WHERE user_id = $1`,
    [userId]
  );
  const total = parseInt(countResult.rows[0].count, 10);
  const totalPages = Math.ceil(total / limit) || 1;

  const result = await pool.query<PrintOrderRow>(
    `SELECT * FROM print_orders
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );

  const orders = result.rows.map(toPrintOrder);

  return {
    orders,
    page,
    limit,
    total,
    totalPages,
  };
}

/**
 * Get a single print order by ID, with user ownership validation.
 *
 * Returns null if the order does not exist or does not belong to the user.
 */
async function getOrder(
  orderId: string,
  userId: string
): Promise<PrintOrder | null> {
  const result = await pool.query<PrintOrderRow>(
    `SELECT * FROM print_orders WHERE id = $1 AND user_id = $2`,
    [orderId, userId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return toPrintOrder(result.rows[0]);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const printOrderService = {
  getAvailableProducts,
  getQuoteWithMargin,
  createOrder,
  confirmPayment,
  updateOrderStatus,
  getUserOrders,
  getOrder,
};
