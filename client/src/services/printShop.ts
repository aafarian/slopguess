/**
 * Print shop service -- typed wrappers around the /api/print-shop endpoints.
 */

import { request } from './api';
import type {
  PrintShopConfig,
  PrintProduct,
  PrintProductsResponse,
  PrintQuote,
  PrintOrder,
  PrintOrdersResponse,
  PrintOrderDetailResponse,
  CreatePrintOrderRequest,
  CreatePrintOrderResponse,
} from '../types/printShop';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/**
 * Fetch the print shop feature flag status.
 * No authentication required.
 *
 * GET /api/print-shop/config
 */
export async function getConfig(): Promise<PrintShopConfig> {
  return request<PrintShopConfig>('/api/print-shop/config', { skipAuth: true });
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

/**
 * Fetch the list of available framed print products.
 *
 * GET /api/print-shop/products
 */
export async function getProducts(): Promise<PrintProduct[]> {
  const data = await request<PrintProductsResponse>('/api/print-shop/products');
  return data.products;
}

// ---------------------------------------------------------------------------
// Quotes
// ---------------------------------------------------------------------------

/**
 * Fetch a price quote for a specific product SKU.
 * Returns pricing with the configured margin included.
 *
 * GET /api/print-shop/quote?sku=XXX
 */
export async function getQuote(sku: string): Promise<PrintQuote> {
  const params = new URLSearchParams({ sku });
  return request<PrintQuote>(`/api/print-shop/quote?${params.toString()}`);
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

/**
 * Create a new print order.
 * Requires authentication. Returns the created order and a Stripe checkout URL.
 *
 * POST /api/print-shop/orders
 */
export async function createOrder(
  data: CreatePrintOrderRequest,
): Promise<CreatePrintOrderResponse> {
  return request<CreatePrintOrderResponse>('/api/print-shop/orders', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * Fetch the current user's print orders (paginated).
 * Requires authentication.
 *
 * GET /api/print-shop/orders
 */
export async function getOrders(
  page?: number,
  limit?: number,
): Promise<PrintOrdersResponse> {
  const params = new URLSearchParams();
  if (page !== undefined) params.set('page', String(page));
  if (limit !== undefined) params.set('limit', String(limit));

  const query = params.toString();
  const url = `/api/print-shop/orders${query ? `?${query}` : ''}`;
  return request<PrintOrdersResponse>(url);
}

/**
 * Fetch a single print order by ID.
 * Requires authentication. Server validates ownership.
 *
 * GET /api/print-shop/orders/:orderId
 */
export async function getOrder(orderId: string): Promise<PrintOrder> {
  const data = await request<PrintOrderDetailResponse>(
    `/api/print-shop/orders/${orderId}`,
  );
  return data.order;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a price in cents to a display string.
 *
 * @param cents  The price in cents (e.g. 2999)
 * @param currency  ISO 4217 currency code (default: "USD")
 * @returns Formatted price string (e.g. "$29.99")
 */
export function formatPrice(cents: number, currency: string = 'USD'): string {
  const amount = cents / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
}
