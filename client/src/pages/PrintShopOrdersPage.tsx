/**
 * PrintShopOrdersPage -- paginated list of the current user's print orders.
 *
 * Route: /print-shop/orders
 *
 * Fetches print orders from the API with pagination. Each order is displayed
 * as a card with an image thumbnail, SKU info, status badge, price, and date.
 * Clicking a card navigates to the order detail page.
 */

import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';

import { getOrders, formatPrice } from '../services/printShop';
import type { PrintOrder, PrintOrderStatus } from '../types/printShop';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import EmptyState from '../components/EmptyState';

const PAGE_LIMIT = 9;

/** Map each order status to a human-readable label. */
const STATUS_LABELS: Record<PrintOrderStatus, string> = {
  pending: 'Pending',
  paid: 'Paid',
  submitted: 'Submitted',
  in_production: 'In Production',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  failed: 'Failed',
};

/** CSS modifier class for each status badge. */
function statusModifier(status: PrintOrderStatus): string {
  return `ps-order-status-badge--${status}`;
}

export default function PrintShopOrdersPage() {
  const [orders, setOrders] = useState<PrintOrder[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = useCallback(async (targetPage: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getOrders(targetPage, PAGE_LIMIT);
      setOrders(data.orders);
      setTotalPages(data.totalPages);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to load orders.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders(page);
  }, [page, fetchOrders]);

  /** Format an ISO date string to a short readable date. */
  function formatDate(dateStr: string): string {
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return '';
    }
  }

  // ---- Loading state ----
  if (loading) {
    return <LoadingSpinner message="Loading your orders..." />;
  }

  // ---- Error state ----
  if (error) {
    return (
      <div className="ps-orders-page">
        <h1 className="ps-orders-page-title">My Print Orders</h1>
        <ErrorMessage message={error} onRetry={() => fetchOrders(page)} />
      </div>
    );
  }

  // ---- Empty state ----
  if (orders.length === 0) {
    return (
      <div className="ps-orders-page">
        <h1 className="ps-orders-page-title">My Print Orders</h1>
        <EmptyState
          title="No print orders yet"
          message="When you order framed prints of your favorite AI art, they'll appear here."
        />
      </div>
    );
  }

  // ---- Render grid ----
  const isFirstPage = page <= 1;
  const isLastPage = page >= totalPages;

  return (
    <div className="ps-orders-page">
      <h1 className="ps-orders-page-title">My Print Orders</h1>

      <div className="ps-orders-grid">
        {orders.map((order) => (
          <Link
            key={order.id}
            to={`/print-shop/orders/${order.id}`}
            className="ps-order-card"
          >
            <div className="ps-order-card-image-wrapper">
              {order.imageUrl ? (
                <img
                  src={order.imageUrl}
                  alt="Print order"
                  className="ps-order-card-image"
                  loading="lazy"
                  onError={(e) => {
                    const target = e.currentTarget;
                    target.style.display = 'none';
                    const placeholder = document.createElement('div');
                    placeholder.className = 'ps-order-card-image-placeholder';
                    placeholder.textContent = 'Image expired';
                    target.parentElement?.appendChild(placeholder);
                  }}
                />
              ) : (
                <div className="ps-order-card-image-placeholder">No Image</div>
              )}
              <div className="ps-order-card-overlay">
                <span
                  className={`ps-order-status-badge ${statusModifier(order.status)}`}
                >
                  {STATUS_LABELS[order.status]}
                </span>
              </div>
            </div>

            <div className="ps-order-card-body">
              <div className="ps-order-card-sku">{order.sku}</div>
              <div className="ps-order-card-meta">
                <span className="ps-order-card-price">
                  {formatPrice(order.totalCostCents, order.currency)}
                </span>
                <span className="ps-order-card-date">
                  {formatDate(order.createdAt)}
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Pagination controls */}
      {totalPages > 1 && (
        <div className="ps-orders-pagination">
          <button
            type="button"
            className="btn btn-outline btn-sm"
            disabled={isFirstPage}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </button>
          <span className="ps-orders-pagination-indicator">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            disabled={isLastPage}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
