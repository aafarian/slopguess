/**
 * Print shop service — typed wrappers around the /api/print-shop endpoints.
 */

import { request } from './api';
import type { PrintShopConfig } from '../types/printShop';

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
