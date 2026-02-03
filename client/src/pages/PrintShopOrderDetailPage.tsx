/**
 * PrintShopOrderDetailPage -- detailed view of a single print order.
 *
 * Route: /print-shop/orders/:orderId
 *
 * Shows the full order information including a large image preview,
 * order status with a visual timeline, price breakdown, and shipping
 * address. Handles ?status=success and ?status=cancelled query params
 * for Stripe redirect feedback.
 */

import { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';

import { getOrder, formatPrice } from '../services/printShop';
import type { PrintOrder, PrintOrderStatus } from '../types/printShop';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';

/** Ordered list of statuses for the timeline (happy path). */
const TIMELINE_STATUSES: PrintOrderStatus[] = [
  'pending',
  'paid',
  'submitted',
  'in_production',
  'shipped',
  'delivered',
];

/** Human-readable labels for the timeline steps. */
const TIMELINE_LABELS: Record<PrintOrderStatus, string> = {
  pending: 'Order Created',
  paid: 'Payment Confirmed',
  submitted: 'Sent to Printer',
  in_production: 'In Production',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  failed: 'Failed',
};

/** Determine where the current status falls in the happy-path timeline. */
function getTimelineIndex(status: PrintOrderStatus): number {
  const idx = TIMELINE_STATUSES.indexOf(status);
  return idx >= 0 ? idx : -1;
}

export default function PrintShopOrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const [searchParams] = useSearchParams();
  const redirectStatus = searchParams.get('status'); // "success" | "cancelled"

  const [order, setOrder] = useState<PrintOrder | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrder = useCallback(async () => {
    if (!orderId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await getOrder(orderId);
      setOrder(data);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to load order.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  // ---- Loading ----
  if (isLoading) {
    return <LoadingSpinner message="Loading order details..." />;
  }

  // ---- Error ----
  if (error) {
    return <ErrorMessage message={error} onRetry={fetchOrder} />;
  }

  if (!order) {
    return <ErrorMessage message="Order not found." />;
  }

  const isCancelled = order.status === 'cancelled';
  const isFailed = order.status === 'failed';
  const isTerminal = isCancelled || isFailed;
  const currentIdx = getTimelineIndex(order.status);

  return (
    <div className="ps-order-detail">
      {/* Stripe redirect banners */}
      {redirectStatus === 'success' && (
        <div className="ps-order-banner ps-order-banner--success">
          Your order has been placed! We'll start processing it shortly.
        </div>
      )}
      {redirectStatus === 'cancelled' && (
        <div className="ps-order-banner ps-order-banner--info">
          Payment was cancelled. You can try again from your order page.
        </div>
      )}

      {/* Large image */}
      <div className="ps-order-detail-image-container">
        {order.imageUrl ? (
          <img
            src={order.imageUrl}
            alt="Print order artwork"
            className="ps-order-detail-image"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              const placeholder =
                e.currentTarget.parentElement?.querySelector(
                  '.ps-order-detail-image-placeholder',
                );
              if (placeholder) {
                (placeholder as HTMLElement).style.display = 'flex';
              }
            }}
          />
        ) : null}
        <div
          className="ps-order-detail-image-placeholder"
          style={order.imageUrl ? { display: 'none' } : undefined}
        >
          <span>Image unavailable</span>
        </div>
      </div>

      <div className="ps-order-detail-body">
        {/* Status badge */}
        <span
          className={`ps-order-status-badge ps-order-status-badge--${order.status}`}
        >
          {TIMELINE_LABELS[order.status]}
        </span>

        {/* Status timeline */}
        <div className="ps-order-timeline">
          <h3 className="ps-order-detail-section-title">Order Progress</h3>
          <div className="ps-order-timeline-track">
            {TIMELINE_STATUSES.map((step, idx) => {
              let state: 'done' | 'current' | 'upcoming' = 'upcoming';
              if (isTerminal) {
                // For cancelled/failed, show all as done up to current, then stop
                state = idx <= currentIdx ? 'done' : 'upcoming';
              } else if (idx < currentIdx) {
                state = 'done';
              } else if (idx === currentIdx) {
                state = 'current';
              }

              return (
                <div
                  key={step}
                  className={`ps-order-timeline-step ps-order-timeline-step--${state}`}
                >
                  <div className="ps-order-timeline-dot" />
                  {idx < TIMELINE_STATUSES.length - 1 && (
                    <div className="ps-order-timeline-line" />
                  )}
                  <span className="ps-order-timeline-label">
                    {TIMELINE_LABELS[step]}
                  </span>
                </div>
              );
            })}
          </div>
          {isTerminal && (
            <div className={`ps-order-timeline-terminal ps-order-timeline-terminal--${order.status}`}>
              {TIMELINE_LABELS[order.status]}
            </div>
          )}
        </div>

        {/* Frame details */}
        <div className="ps-order-detail-section">
          <h3 className="ps-order-detail-section-title">Frame Details</h3>
          <div className="ps-order-detail-info-grid">
            <InfoRow label="Product" value={order.sku} />
            <InfoRow label="Quantity" value={String(order.quantity)} />
          </div>
        </div>

        {/* Price breakdown */}
        <div className="ps-order-detail-section">
          <h3 className="ps-order-detail-section-title">Price Breakdown</h3>
          <div className="ps-order-detail-price-breakdown">
            <div className="ps-order-detail-price-row">
              <span>Base cost</span>
              <span>{formatPrice(order.baseCostCents, order.currency)}</span>
            </div>
            <div className="ps-order-detail-price-row">
              <span>Service fee</span>
              <span>{formatPrice(order.marginCents, order.currency)}</span>
            </div>
            <div className="ps-order-detail-price-row ps-order-detail-price-row--total">
              <span>Total</span>
              <span>{formatPrice(order.totalCostCents, order.currency)}</span>
            </div>
          </div>
        </div>

        {/* Shipping address */}
        <div className="ps-order-detail-section">
          <h3 className="ps-order-detail-section-title">Shipping Address</h3>
          <div className="ps-order-detail-address">
            <p>{order.shippingName}</p>
            <p>{order.shippingLine1}</p>
            {order.shippingLine2 && <p>{order.shippingLine2}</p>}
            <p>
              {order.shippingCity}
              {order.shippingState ? `, ${order.shippingState}` : ''}{' '}
              {order.shippingPostalCode}
            </p>
            <p>{order.shippingCountry}</p>
          </div>
        </div>

        {/* Order dates */}
        <div className="ps-order-detail-section">
          <h3 className="ps-order-detail-section-title">Order Info</h3>
          <div className="ps-order-detail-info-grid">
            <InfoRow label="Order ID" value={order.id.slice(0, 8) + '...'} />
            <InfoRow label="Ordered" value={formatFullDate(order.createdAt)} />
            <InfoRow label="Last Updated" value={formatFullDate(order.updatedAt)} />
          </div>
        </div>
      </div>

      {/* Back link */}
      <div className="ps-order-detail-back">
        <Link to="/print-shop/orders" className="btn btn-outline btn-sm">
          Back to Orders
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="ps-order-detail-info-row">
      <span className="ps-order-detail-info-label">{label}</span>
      <span className="ps-order-detail-info-value">{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatFullDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}
