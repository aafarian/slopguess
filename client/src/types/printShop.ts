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
