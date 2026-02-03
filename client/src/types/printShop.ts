/**
 * Shared print shop types used across the frontend.
 * These mirror the exact shapes returned by the backend API.
 */

// ---------------------------------------------------------------------------
// Feature flag config
// ---------------------------------------------------------------------------

/** Response from GET /api/print-shop/config. */
export interface PrintShopConfig {
  enabled: boolean;
}

// ---------------------------------------------------------------------------
// Print order status
// ---------------------------------------------------------------------------

/** Print order lifecycle status -- matches server PrintOrderStatus. */
export type PrintOrderStatus =
  | 'pending'
  | 'paid'
  | 'submitted'
  | 'in_production'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'failed';

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

/** A framed print product available for purchase. */
export interface PrintProduct {
  sku: string;
  description: string;
  frameSizes: string[];
  frameStyles: string[];
}

/** Response from GET /api/print-shop/products. */
export interface PrintProductsResponse {
  products: PrintProduct[];
}

// ---------------------------------------------------------------------------
// Quotes
// ---------------------------------------------------------------------------

/** Price quote for a specific SKU (includes margin). */
export interface PrintQuote {
  sku: string;
  baseCostCents: number;
  marginCents: number;
  totalCostCents: number;
  currency: string;
}

// ---------------------------------------------------------------------------
// Shipping
// ---------------------------------------------------------------------------

/** Shipping address for a print order. */
export interface ShippingAddress {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  postalCode: string;
  country: string;
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

/**
 * Public print order as returned by the API.
 * Mirrors server PublicPrintOrder (sensitive fields like stripePaymentIntentId
 * are stripped server-side).
 */
export interface PrintOrder {
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

// ---------------------------------------------------------------------------
// API request / response shapes
// ---------------------------------------------------------------------------

/** Request body for POST /api/print-shop/orders. */
export interface CreatePrintOrderRequest {
  roundId: string;
  sku: string;
  shippingAddress: ShippingAddress;
}

/** Response from POST /api/print-shop/orders. */
export interface CreatePrintOrderResponse {
  order: PrintOrder;
  checkoutUrl: string | null;
}

/** Response from GET /api/print-shop/orders/:orderId. */
export interface PrintOrderDetailResponse {
  order: PrintOrder;
}

/** Response from GET /api/print-shop/orders (paginated). */
export interface PrintOrdersResponse {
  orders: PrintOrder[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
