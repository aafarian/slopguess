/**
 * Prodigi print-on-demand API service.
 *
 * Wraps the Prodigi v4.0 REST API for product catalog, quoting,
 * order creation, and order status retrieval.
 *
 * All methods are guarded by isProdigiConfigured(). If the Prodigi API key
 * is not set (e.g. in local dev), methods throw a descriptive error.
 *
 * The API key is never logged or exposed in error messages.
 */

import { env, isProdigiConfigured } from "../config/env";
import { logger } from "../config/logger";

// ---------------------------------------------------------------------------
// Types
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

/** A product from the Prodigi catalog. */
export interface ProdigiProduct {
  sku: string;
  description: string;
  frameSizes: string[];
  frameStyles: string[];
}

/** A price quote from Prodigi. */
export interface ProdigiQuote {
  sku: string;
  costCents: number;
  currency: string;
}

/** A Prodigi order. */
export interface ProdigiOrder {
  id: string;
  status: string;
  created: string;
  items: Array<{
    sku: string;
    quantity: number;
  }>;
  shipping: {
    method: string;
    tracking?: {
      number?: string;
      url?: string;
    };
  };
}

/** Parameters for creating a Prodigi order. */
export interface CreateOrderParams {
  imageUrl: string;
  sku: string;
  quantity: number;
  shippingAddress: ShippingAddress;
  idempotencyKey?: string;
}

// ---------------------------------------------------------------------------
// Guard
// ---------------------------------------------------------------------------

/**
 * Throws a descriptive error when Prodigi is not configured.
 */
function requireProdigi(): void {
  if (!isProdigiConfigured()) {
    throw new Error(
      "Prodigi is not configured. Set PRODIGI_API_KEY in your environment to enable print-on-demand features.",
    );
  }
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

/**
 * Make an authenticated request to the Prodigi API.
 * Never logs or exposes the API key in error messages.
 */
async function prodigiFetch<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const url = `${env.PRODIGI_API_URL}${path}`;

  const headers: Record<string, string> = {
    "X-API-Key": env.PRODIGI_API_KEY,
    "Content-Type": "application/json",
    "Accept": "application/json",
  };

  const options: RequestInit = {
    method,
    headers,
  };

  if (body !== undefined) {
    options.body = JSON.stringify(body);
  }

  logger.debug("prodigiService", `${method} ${path}`);

  let response: Response;
  try {
    response = await fetch(url, options);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("prodigiService", "Network error calling Prodigi API", {
      path,
      error: message,
    });
    throw new Error(`Prodigi API network error: ${message}`);
  }

  if (!response.ok) {
    let errorBody: string;
    try {
      errorBody = await response.text();
    } catch {
      errorBody = "(unable to read response body)";
    }
    logger.error("prodigiService", "Prodigi API error response", {
      path,
      status: response.status,
      body: errorBody,
    });
    throw new Error(
      `Prodigi API error (${response.status}): ${errorBody}`,
    );
  }

  const data = (await response.json()) as T;
  return data;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

/**
 * Fetch available framed print products from the Prodigi catalog.
 *
 * Returns a simplified list of products with SKU, description,
 * frame sizes, and frame styles.
 */
async function getProducts(): Promise<ProdigiProduct[]> {
  requireProdigi();

  logger.info("prodigiService", "Fetching product catalog");

  interface ProdigiProductsResponse {
    products: Array<{
      sku: string;
      description: string;
      attributes?: {
        frameSizes?: string[];
        frameStyles?: string[];
      };
      variants?: Array<{
        attributes?: Record<string, string>;
      }>;
    }>;
  }

  const data = await prodigiFetch<ProdigiProductsResponse>(
    "GET",
    "/products?type=frame",
  );

  const products: ProdigiProduct[] = (data.products || []).map((p) => ({
    sku: p.sku,
    description: p.description,
    frameSizes: p.attributes?.frameSizes || [],
    frameStyles: p.attributes?.frameStyles || [],
  }));

  logger.info("prodigiService", "Product catalog fetched", {
    count: products.length,
  });

  return products;
}

/**
 * Get a price quote from Prodigi for a given product SKU and quantity.
 *
 * Returns the base cost in cents and the currency.
 */
async function getQuote(sku: string, quantity: number): Promise<ProdigiQuote> {
  requireProdigi();

  logger.info("prodigiService", "Requesting quote", { sku, quantity });

  interface ProdigiQuoteResponse {
    quotes: Array<{
      costSummary: {
        totalCost: {
          amount: string;
          currency: string;
        };
      };
    }>;
  }

  const data = await prodigiFetch<ProdigiQuoteResponse>("POST", "/quotes", {
    shippingMethod: "standard",
    destinationCountryCode: "US",
    items: [
      {
        sku,
        copies: quantity,
        assets: [{ printArea: "default" }],
      },
    ],
  });

  const quote = data.quotes?.[0];
  if (!quote) {
    throw new Error("Prodigi returned no quotes for the requested product");
  }

  const amount = parseFloat(quote.costSummary.totalCost.amount);
  const costCents = Math.round(amount * 100);
  const currency = quote.costSummary.totalCost.currency;

  logger.info("prodigiService", "Quote received", {
    sku,
    costCents,
    currency,
  });

  return { sku, costCents, currency };
}

/**
 * Create a print order with Prodigi.
 *
 * Submits the order with the image URL (Prodigi fetches the image directly),
 * product SKU, quantity, and shipping address.
 *
 * Returns the Prodigi order ID and initial status.
 */
async function createOrder(params: CreateOrderParams): Promise<{ orderId: string; status: string }> {
  requireProdigi();

  logger.info("prodigiService", "Creating order", {
    sku: params.sku,
    quantity: params.quantity,
  });

  interface ProdigiCreateOrderResponse {
    order: {
      id: string;
      status: {
        stage: string;
      };
    };
  }

  const requestBody: Record<string, unknown> = {
    shippingMethod: "standard",
    recipient: {
      name: params.shippingAddress.name,
      address: {
        line1: params.shippingAddress.line1,
        line2: params.shippingAddress.line2 || "",
        postalOrZipCode: params.shippingAddress.postalCode,
        townOrCity: params.shippingAddress.city,
        stateOrCounty: params.shippingAddress.state || "",
        countryCode: params.shippingAddress.country,
      },
    },
    items: [
      {
        sku: params.sku,
        copies: params.quantity,
        assets: [{ printArea: "default", url: params.imageUrl }],
      },
    ],
  };

  if (params.idempotencyKey) {
    requestBody.idempotencyKey = params.idempotencyKey;
  }

  const data = await prodigiFetch<ProdigiCreateOrderResponse>(
    "POST",
    "/orders",
    requestBody,
  );

  const orderId = data.order.id;
  const status = data.order.status.stage;

  logger.info("prodigiService", "Order created", {
    prodigiOrderId: orderId,
    status,
  });

  return { orderId, status };
}

/**
 * Fetch the current status of a Prodigi order.
 *
 * Returns the full order object including status, items, and shipping info.
 */
async function getOrderStatus(prodigiOrderId: string): Promise<ProdigiOrder> {
  requireProdigi();

  logger.info("prodigiService", "Fetching order status", {
    prodigiOrderId,
  });

  interface ProdigiOrderResponse {
    order: {
      id: string;
      status: {
        stage: string;
      };
      created: string;
      items: Array<{
        sku: string;
        copies: number;
      }>;
      shipments?: Array<{
        carrier?: {
          name?: string;
        };
        tracking?: {
          number?: string;
          url?: string;
        };
      }>;
    };
  }

  const data = await prodigiFetch<ProdigiOrderResponse>(
    "GET",
    `/orders/${encodeURIComponent(prodigiOrderId)}`,
  );

  const order = data.order;
  const shipment = order.shipments?.[0];

  const result: ProdigiOrder = {
    id: order.id,
    status: order.status.stage,
    created: order.created,
    items: (order.items || []).map((item) => ({
      sku: item.sku,
      quantity: item.copies,
    })),
    shipping: {
      method: shipment?.carrier?.name || "standard",
      tracking: shipment?.tracking
        ? {
            number: shipment.tracking.number,
            url: shipment.tracking.url,
          }
        : undefined,
    },
  };

  logger.info("prodigiService", "Order status fetched", {
    prodigiOrderId,
    status: result.status,
  });

  return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const prodigiService = {
  getProducts,
  getQuote,
  createOrder,
  getOrderStatus,
};
