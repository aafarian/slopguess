/**
 * Print order model types.
 * Defines the database row shape, application shape, and public API shape
 * for print shop orders (framed prints of AI-generated round images).
 *
 * Status lifecycle: pending -> paid -> submitted -> in_production -> shipped -> delivered
 * Also supports: cancelled, failed
 */

/** Print order status covering the full order lifecycle. */
export type PrintOrderStatus =
  | 'pending'
  | 'paid'
  | 'submitted'
  | 'in_production'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'failed';

/** Full print order row as stored in PostgreSQL (snake_case). */
export interface PrintOrderRow {
  id: string;
  user_id: string;
  round_id: string;
  prodigi_order_id: string | null;
  stripe_payment_intent_id: string | null;
  sku: string;
  quantity: number;
  base_cost_cents: number;
  margin_cents: number;
  total_cost_cents: number;
  currency: string;
  status: PrintOrderStatus;
  shipping_name: string;
  shipping_line1: string;
  shipping_line2: string | null;
  shipping_city: string;
  shipping_state: string | null;
  shipping_postal_code: string;
  shipping_country: string;
  image_url: string;
  created_at: Date;
  updated_at: Date;
}

/** CamelCase print order for application use. */
export interface PrintOrder {
  id: string;
  userId: string;
  roundId: string;
  prodigiOrderId: string | null;
  stripePaymentIntentId: string | null;
  sku: string;
  quantity: number;
  baseCostCents: number;
  marginCents: number;
  totalCostCents: number;
  currency: string;
  status: PrintOrderStatus;
  shippingName: string;
  shippingLine1: string;
  shippingLine2: string | null;
  shippingCity: string;
  shippingState: string | null;
  shippingPostalCode: string;
  shippingCountry: string;
  imageUrl: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Public print order returned by API responses.
 * Strips stripePaymentIntentId to avoid exposing payment details.
 */
export interface PublicPrintOrder {
  id: string;
  userId: string;
  roundId: string;
  prodigiOrderId: string | null;
  sku: string;
  quantity: number;
  baseCostCents: number;
  marginCents: number;
  totalCostCents: number;
  currency: string;
  status: PrintOrderStatus;
  shippingName: string;
  shippingLine1: string;
  shippingLine2: string | null;
  shippingCity: string;
  shippingState: string | null;
  shippingPostalCode: string;
  shippingCountry: string;
  imageUrl: string;
  createdAt: string;
  updatedAt: string;
}

/** Convert a database row to a PrintOrder (snake_case to camelCase). */
export function toPrintOrder(row: PrintOrderRow): PrintOrder {
  return {
    id: row.id,
    userId: row.user_id,
    roundId: row.round_id,
    prodigiOrderId: row.prodigi_order_id,
    stripePaymentIntentId: row.stripe_payment_intent_id,
    sku: row.sku,
    quantity: row.quantity,
    baseCostCents: row.base_cost_cents,
    marginCents: row.margin_cents,
    totalCostCents: row.total_cost_cents,
    currency: row.currency,
    status: row.status,
    shippingName: row.shipping_name,
    shippingLine1: row.shipping_line1,
    shippingLine2: row.shipping_line2,
    shippingCity: row.shipping_city,
    shippingState: row.shipping_state,
    shippingPostalCode: row.shipping_postal_code,
    shippingCountry: row.shipping_country,
    imageUrl: row.image_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Convert a PrintOrder to a PublicPrintOrder (strips stripePaymentIntentId). */
export function toPublicPrintOrder(order: PrintOrder): PublicPrintOrder {
  return {
    id: order.id,
    userId: order.userId,
    roundId: order.roundId,
    prodigiOrderId: order.prodigiOrderId,
    sku: order.sku,
    quantity: order.quantity,
    baseCostCents: order.baseCostCents,
    marginCents: order.marginCents,
    totalCostCents: order.totalCostCents,
    currency: order.currency,
    status: order.status,
    shippingName: order.shippingName,
    shippingLine1: order.shippingLine1,
    shippingLine2: order.shippingLine2,
    shippingCity: order.shippingCity,
    shippingState: order.shippingState,
    shippingPostalCode: order.shippingPostalCode,
    shippingCountry: order.shippingCountry,
    imageUrl: order.imageUrl,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}
