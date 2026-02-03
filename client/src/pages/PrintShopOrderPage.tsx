/**
 * PrintShopOrderPage -- 4-step order flow for purchasing framed prints.
 *
 * Steps:
 *  1. Preview   -- Fetch round, display the AI image large
 *  2. Customize -- Pick frame size & style, see live price quote
 *  3. Shipping  -- Address form with client-side validation
 *  4. Review    -- Order summary with price breakdown, Place Order -> Stripe
 *
 * Reads `roundId` from the URL query string (?roundId=UUID).
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getRound } from '../services/game';
import { getQuote, createOrder, formatPrice } from '../services/printShop';
import type { Round } from '../types/game';
import type { PrintQuote, ShippingAddress } from '../types/printShop';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Available product types with SKU prefix and frame info. */
const PRODUCT_TYPES: { value: string; label: string; prefix: string; description: string; hasFrame: boolean }[] = [
  { value: 'FAP', label: 'Fine Art Print', prefix: 'GLOBAL-FAP', description: 'Museum-quality print, no frame', hasFrame: false },
  { value: 'CFP', label: 'Classic Frame', prefix: 'GLOBAL-CFP', description: 'Framed print, no mount', hasFrame: true },
  { value: 'CFPM', label: 'Premium Frame', prefix: 'GLOBAL-CFPM', description: 'Framed with mount — our best option', hasFrame: true },
];

/** Available frame sizes mapped to Prodigi SKU sizes. */
const FRAME_SIZES: { value: string; label: string }[] = [
  { value: '12X16', label: '12" x 16"' },
  { value: '16X20', label: '16" x 20"' },
  { value: '20X28', label: '20" x 28"' },
];

/** Available frame styles with display labels. */
const FRAME_STYLES: { value: string; label: string }[] = [
  { value: 'black', label: 'Black' },
  { value: 'white', label: 'White' },
  { value: 'natural', label: 'Natural Wood' },
];

/** Country options for shipping. */
const COUNTRIES: { value: string; label: string }[] = [
  { value: 'US', label: 'United States' },
  { value: 'CA', label: 'Canada' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'AU', label: 'Australia' },
  { value: 'DE', label: 'Germany' },
  { value: 'FR', label: 'France' },
  { value: 'NL', label: 'Netherlands' },
  { value: 'SE', label: 'Sweden' },
  { value: 'NO', label: 'Norway' },
  { value: 'DK', label: 'Denmark' },
  { value: 'IE', label: 'Ireland' },
  { value: 'NZ', label: 'New Zealand' },
];

type Step = 1 | 2 | 3 | 4;

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

interface ValidationErrors {
  name?: string;
  line1?: string;
  city?: string;
  postalCode?: string;
  country?: string;
}

function validateShipping(address: ShippingAddress): ValidationErrors {
  const errors: ValidationErrors = {};
  if (!address.name.trim()) errors.name = 'Name is required';
  if (!address.line1.trim()) errors.line1 = 'Address line 1 is required';
  if (!address.city.trim()) errors.city = 'City is required';
  if (!address.postalCode.trim()) errors.postalCode = 'Postal code is required';
  if (!address.country) errors.country = 'Country is required';
  return errors;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PrintShopOrderPage() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const roundId = searchParams.get('roundId');

  // Step navigation
  const [step, setStep] = useState<Step>(1);

  // Data
  const [round, setRound] = useState<Round | null>(null);
  const [quote, setQuote] = useState<PrintQuote | null>(null);

  // Selections
  const [selectedType, setSelectedType] = useState<string>('');
  const [selectedSize, setSelectedSize] = useState<string>('');
  const [selectedStyle, setSelectedStyle] = useState<string>('');

  // Shipping form
  const [shippingAddress, setShippingAddress] = useState<ShippingAddress>({
    name: '',
    line1: '',
    line2: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'US',
  });
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({});

  // UI state
  const [loading, setLoading] = useState(true);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  // Look up the selected product type config
  const selectedProductType = useMemo(
    () => PRODUCT_TYPES.find((t) => t.value === selectedType),
    [selectedType],
  );

  // Derived SKU from selections
  // FAP: GLOBAL-FAP-{SIZE}  |  CFP/CFPM: GLOBAL-{TYPE}-{SIZE}-{COLOR}
  const selectedSku = useMemo(() => {
    if (!selectedType || !selectedSize) return '';
    if (selectedType === 'FAP') return `GLOBAL-FAP-${selectedSize}`;
    if (!selectedStyle) return '';
    return `GLOBAL-${selectedType}-${selectedSize}-${selectedStyle.toUpperCase()}`;
  }, [selectedType, selectedSize, selectedStyle]);

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------

  const fetchRoundData = useCallback(async () => {
    if (!roundId) return;
    setLoading(true);
    setError(null);
    try {
      const roundData = await getRound(roundId);
      setRound(roundData.round as Round);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load round data.',
      );
    } finally {
      setLoading(false);
    }
  }, [roundId]);

  useEffect(() => {
    fetchRoundData();
  }, [fetchRoundData]);

  // Fetch quote when SKU changes
  useEffect(() => {
    if (!selectedSku) {
      setQuote(null);
      return;
    }

    let cancelled = false;
    async function fetchQuote() {
      setQuoteLoading(true);
      try {
        const q = await getQuote(selectedSku);
        if (!cancelled) setQuote(q);
      } catch {
        if (!cancelled) setQuote(null);
      } finally {
        if (!cancelled) setQuoteLoading(false);
      }
    }

    fetchQuote();
    return () => { cancelled = true; };
  }, [selectedSku]);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  function handleShippingChange(field: keyof ShippingAddress, value: string) {
    setShippingAddress((prev) => ({ ...prev, [field]: value }));
    // Clear validation error for the field being edited
    if (validationErrors[field as keyof ValidationErrors]) {
      setValidationErrors((prev) => {
        const next = { ...prev };
        delete next[field as keyof ValidationErrors];
        return next;
      });
    }
  }

  function handleNextFromShipping() {
    const errors = validateShipping(shippingAddress);
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }
    setValidationErrors({});
    setStep(4);
  }

  async function handlePlaceOrder() {
    if (!roundId || !selectedSku) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await createOrder({
        roundId,
        sku: selectedSku,
        shippingAddress,
      });
      // Redirect to Stripe checkout
      if (response.checkoutUrl) {
        window.location.href = response.checkoutUrl;
      } else {
        // Fallback: go to order detail
        navigate(`/print-shop/orders/${response.order.id}?status=success`);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to create order.',
      );
      setSubmitting(false);
    }
  }

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------

  /** CSS class for the frame preview border based on style selection. */
  function framePreviewClass(): string {
    if (selectedProductType && !selectedProductType.hasFrame) {
      return 'ps-order-frame-preview ps-order-frame-preview--noframe';
    }
    const base = 'ps-order-frame-preview';
    if (selectedStyle === 'black') return `${base} ${base}--black`;
    if (selectedStyle === 'white') return `${base} ${base}--white`;
    if (selectedStyle === 'natural') return `${base} ${base}--natural`;
    return base;
  }

  // -------------------------------------------------------------------------
  // Guard: no roundId
  // -------------------------------------------------------------------------

  if (!roundId) {
    return (
      <div className="ps-order-page">
        <ErrorMessage message="No round ID provided. Please select an image to frame from a round." />
        <div className="ps-order-back">
          <Link to="/" className="btn btn-outline">Back to Game</Link>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Guard: not authenticated
  // -------------------------------------------------------------------------

  if (!isAuthenticated) {
    return (
      <div className="ps-order-page">
        <div className="ps-order-auth-cta">
          <h2>Sign in to order a print</h2>
          <p>You need to be logged in to place an order.</p>
          <div className="ps-order-auth-actions">
            <Link to={`/login?returnTo=${encodeURIComponent(`/print-shop/order?roundId=${roundId}`)}`} className="btn btn-primary">
              Log In
            </Link>
            <Link to="/register" className="btn btn-outline">Register</Link>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Guard: loading
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="ps-order-page">
        <LoadingSpinner message="Loading print order..." />
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Guard: error
  // -------------------------------------------------------------------------

  if (error && !round) {
    return (
      <div className="ps-order-page">
        <ErrorMessage message={error} onRetry={fetchRoundData} />
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Guard: no round or no image
  // -------------------------------------------------------------------------

  if (!round || !round.imageUrl) {
    return (
      <div className="ps-order-page">
        <ErrorMessage message="This round does not have an image available for printing." />
        <div className="ps-order-back">
          <Link to="/" className="btn btn-outline">Back to Game</Link>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Step progress indicator
  // -------------------------------------------------------------------------

  const steps: { num: Step; label: string }[] = [
    { num: 1, label: 'Preview' },
    { num: 2, label: 'Customize' },
    { num: 3, label: 'Shipping' },
    { num: 4, label: 'Review' },
  ];

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="ps-order-page">
      <h1 className="ps-order-title">Order a Print</h1>

      {/* Step progress bar */}
      <div className="ps-order-steps">
        {steps.map((s) => (
          <div
            key={s.num}
            className={`ps-order-step ${s.num === step ? 'ps-order-step--active' : ''} ${s.num < step ? 'ps-order-step--done' : ''}`}
          >
            <span className="ps-order-step-num">{s.num < step ? '\u2713' : s.num}</span>
            <span className="ps-order-step-label">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Error banner (non-blocking) */}
      {error && (
        <div className="ps-order-error-banner">
          <p>{error}</p>
          <button type="button" className="ps-order-error-dismiss" onClick={() => setError(null)}>
            &times;
          </button>
        </div>
      )}

      {/* Lightbox overlay */}
      {lightboxOpen && round.imageUrl && (
        <div className="ps-lightbox" onClick={() => setLightboxOpen(false)}>
          <img src={round.imageUrl} alt="Full-size preview" className="ps-lightbox-img" />
          <button type="button" className="ps-lightbox-close" aria-label="Close">&times;</button>
        </div>
      )}

      {/* ---- Step 1: Preview ---- */}
      {step === 1 && (
        <div className="ps-order-step-content">
          <div className="ps-order-customize">
            <div className="ps-order-customize-preview">
              <img
                src={round.imageUrl}
                alt="AI-generated image to be framed"
                className="ps-order-preview-img ps-order-preview-img--clickable"
                onClick={() => setLightboxOpen(true)}
                title="Click to enlarge"
              />
            </div>
            <div className="ps-order-customize-options">
              <h2 className="ps-order-preview-heading">Get a Print of This Image</h2>
              <p className="ps-order-preview-caption">
                Get a high-quality print of this image. Choose from fine art prints or professionally framed options. Click the image to see it full size.
              </p>
              <div className="ps-order-actions">
                <button className="btn btn-primary" onClick={() => setStep(2)}>
                  Choose Print Options
                </button>
                <Link to={`/rounds/${round.id}`} className="btn btn-outline">
                  Back to Round
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---- Step 2: Customize ---- */}
      {step === 2 && (
        <div className="ps-order-step-content">
          <div className="ps-order-customize">
            {/* Live frame preview */}
            <div className="ps-order-customize-preview">
              <div
                className={`${framePreviewClass()} ps-order-frame-preview--clickable`}
                onClick={() => setLightboxOpen(true)}
                title="Click to enlarge"
              >
                <img
                  src={round.imageUrl}
                  alt="Frame preview"
                  className="ps-order-frame-img"
                />
              </div>
            </div>

            <div className="ps-order-customize-options">
              {/* Product type */}
              <fieldset className="ps-order-fieldset">
                <legend className="ps-order-legend">Product Type</legend>
                <div className="ps-order-option-grid">
                  {PRODUCT_TYPES.map((type) => (
                    <button
                      key={type.value}
                      type="button"
                      className={`ps-order-option-btn ps-order-option-btn--type ${selectedType === type.value ? 'ps-order-option-btn--selected' : ''}`}
                      onClick={() => {
                        setSelectedType(type.value);
                        if (!type.hasFrame) setSelectedStyle('');
                      }}
                    >
                      <span className="ps-order-type-label">{type.label}</span>
                      <span className="ps-order-type-desc">{type.description}</span>
                    </button>
                  ))}
                </div>
              </fieldset>

              {/* Size */}
              <fieldset className="ps-order-fieldset">
                <legend className="ps-order-legend">Size</legend>
                <div className="ps-order-option-grid">
                  {FRAME_SIZES.map((size) => (
                    <button
                      key={size.value}
                      type="button"
                      className={`ps-order-option-btn ${selectedSize === size.value ? 'ps-order-option-btn--selected' : ''}`}
                      onClick={() => setSelectedSize(size.value)}
                    >
                      {size.label}
                    </button>
                  ))}
                </div>
              </fieldset>

              {/* Frame color — only for framed products */}
              {selectedProductType?.hasFrame && (
                <fieldset className="ps-order-fieldset">
                  <legend className="ps-order-legend">Frame Color</legend>
                  <div className="ps-order-option-grid">
                    {FRAME_STYLES.map((style) => (
                      <button
                        key={style.value}
                        type="button"
                        className={`ps-order-option-btn ps-order-option-btn--style-${style.value} ${selectedStyle === style.value ? 'ps-order-option-btn--selected' : ''}`}
                        onClick={() => setSelectedStyle(style.value)}
                      >
                        <span className={`ps-order-style-swatch ps-order-style-swatch--${style.value}`} />
                        {style.label}
                      </button>
                    ))}
                  </div>
                </fieldset>
              )}

              {/* Price quote */}
              {selectedSku && (
                <div className="ps-order-quote">
                  {quoteLoading ? (
                    <span className="ps-order-quote-loading">Fetching price...</span>
                  ) : quote ? (
                    <div className="ps-order-quote-price">
                      <span className="ps-order-quote-label">Price:</span>
                      <span className="ps-order-quote-value">{formatPrice(quote.totalCostCents, quote.currency)}</span>
                    </div>
                  ) : (
                    <span className="ps-order-quote-error">Unable to fetch price for this option.</span>
                  )}
                </div>
              )}

              {/* Actions inside the options column so they align */}
              <div className="ps-order-actions">
                <button
                  className="btn btn-primary"
                  disabled={!selectedSku || !quote}
                  onClick={() => setStep(3)}
                >
                  Continue to Shipping
                </button>
                <button className="btn btn-outline" onClick={() => setStep(1)}>
                  Back
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---- Step 3: Shipping ---- */}
      {step === 3 && (
        <div className="ps-order-step-content">
          <form
            className="ps-order-shipping-form"
            onSubmit={(e) => { e.preventDefault(); handleNextFromShipping(); }}
            noValidate
          >
            <div className="ps-order-form-group">
              <label htmlFor="ps-ship-name" className="ps-order-label">Full Name *</label>
              <input
                id="ps-ship-name"
                type="text"
                className={`ps-order-input ${validationErrors.name ? 'ps-order-input--error' : ''}`}
                value={shippingAddress.name}
                onChange={(e) => handleShippingChange('name', e.target.value)}
                placeholder="John Doe"
              />
              {validationErrors.name && <span className="ps-order-field-error">{validationErrors.name}</span>}
            </div>

            <div className="ps-order-form-group">
              <label htmlFor="ps-ship-line1" className="ps-order-label">Address Line 1 *</label>
              <input
                id="ps-ship-line1"
                type="text"
                className={`ps-order-input ${validationErrors.line1 ? 'ps-order-input--error' : ''}`}
                value={shippingAddress.line1}
                onChange={(e) => handleShippingChange('line1', e.target.value)}
                placeholder="123 Main St"
              />
              {validationErrors.line1 && <span className="ps-order-field-error">{validationErrors.line1}</span>}
            </div>

            <div className="ps-order-form-group">
              <label htmlFor="ps-ship-line2" className="ps-order-label">Address Line 2</label>
              <input
                id="ps-ship-line2"
                type="text"
                className="ps-order-input"
                value={shippingAddress.line2 || ''}
                onChange={(e) => handleShippingChange('line2', e.target.value)}
                placeholder="Apt, Suite, Unit (optional)"
              />
            </div>

            <div className="ps-order-form-row">
              <div className="ps-order-form-group ps-order-form-group--flex">
                <label htmlFor="ps-ship-city" className="ps-order-label">City *</label>
                <input
                  id="ps-ship-city"
                  type="text"
                  className={`ps-order-input ${validationErrors.city ? 'ps-order-input--error' : ''}`}
                  value={shippingAddress.city}
                  onChange={(e) => handleShippingChange('city', e.target.value)}
                  placeholder="New York"
                />
                {validationErrors.city && <span className="ps-order-field-error">{validationErrors.city}</span>}
              </div>

              <div className="ps-order-form-group ps-order-form-group--flex">
                <label htmlFor="ps-ship-state" className="ps-order-label">State / Province</label>
                <input
                  id="ps-ship-state"
                  type="text"
                  className="ps-order-input"
                  value={shippingAddress.state || ''}
                  onChange={(e) => handleShippingChange('state', e.target.value)}
                  placeholder="NY"
                />
              </div>
            </div>

            <div className="ps-order-form-row">
              <div className="ps-order-form-group ps-order-form-group--flex">
                <label htmlFor="ps-ship-postal" className="ps-order-label">Postal Code *</label>
                <input
                  id="ps-ship-postal"
                  type="text"
                  className={`ps-order-input ${validationErrors.postalCode ? 'ps-order-input--error' : ''}`}
                  value={shippingAddress.postalCode}
                  onChange={(e) => handleShippingChange('postalCode', e.target.value)}
                  placeholder="10001"
                />
                {validationErrors.postalCode && <span className="ps-order-field-error">{validationErrors.postalCode}</span>}
              </div>

              <div className="ps-order-form-group ps-order-form-group--flex">
                <label htmlFor="ps-ship-country" className="ps-order-label">Country *</label>
                <select
                  id="ps-ship-country"
                  className={`ps-order-input ps-order-select ${validationErrors.country ? 'ps-order-input--error' : ''}`}
                  value={shippingAddress.country}
                  onChange={(e) => handleShippingChange('country', e.target.value)}
                >
                  <option value="">Select country</option>
                  {COUNTRIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
                {validationErrors.country && <span className="ps-order-field-error">{validationErrors.country}</span>}
              </div>
            </div>

            <div className="ps-order-actions">
              <button type="submit" className="btn btn-primary">
                Continue to Review
              </button>
              <button type="button" className="btn btn-outline" onClick={() => setStep(2)}>
                Back
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ---- Step 4: Review & Pay ---- */}
      {step === 4 && quote && (
        <div className="ps-order-step-content">
          <div className="ps-order-review">
            {/* Image thumbnail + frame info */}
            <div className="ps-order-review-product">
              <div className={`ps-order-review-thumb-frame ${framePreviewClass()}`}>
                <img
                  src={round.imageUrl}
                  alt="Print preview"
                  className="ps-order-review-thumb"
                />
              </div>
              <div className="ps-order-review-details">
                <h3 className="ps-order-review-heading">{selectedProductType?.label || 'Print'}</h3>
                <p className="ps-order-review-detail">
                  Size: {FRAME_SIZES.find((s) => s.value === selectedSize)?.label}
                </p>
                {selectedProductType?.hasFrame && (
                  <p className="ps-order-review-detail">
                    Frame: {FRAME_STYLES.find((s) => s.value === selectedStyle)?.label}
                  </p>
                )}
              </div>
            </div>

            {/* Price breakdown */}
            <div className="ps-order-review-pricing">
              <h3 className="ps-order-review-heading">Price Breakdown</h3>
              <div className="ps-order-review-line">
                <span>{selectedProductType?.hasFrame ? 'Print + Frame' : 'Print'}</span>
                <span>{formatPrice(quote.baseCostCents, quote.currency)}</span>
              </div>
              <div className="ps-order-review-line">
                <span>Service Fee</span>
                <span>{formatPrice(quote.marginCents, quote.currency)}</span>
              </div>
              <div className="ps-order-review-line ps-order-review-line--total">
                <span>Total</span>
                <span>{formatPrice(quote.totalCostCents, quote.currency)}</span>
              </div>
            </div>

            {/* Shipping address */}
            <div className="ps-order-review-shipping">
              <h3 className="ps-order-review-heading">Shipping Address</h3>
              <p className="ps-order-review-address">{shippingAddress.name}</p>
              <p className="ps-order-review-address">{shippingAddress.line1}</p>
              {shippingAddress.line2 && (
                <p className="ps-order-review-address">{shippingAddress.line2}</p>
              )}
              <p className="ps-order-review-address">
                {shippingAddress.city}{shippingAddress.state ? `, ${shippingAddress.state}` : ''} {shippingAddress.postalCode}
              </p>
              <p className="ps-order-review-address">
                {COUNTRIES.find((c) => c.value === shippingAddress.country)?.label || shippingAddress.country}
              </p>
            </div>
          </div>

          <div className="ps-order-actions">
            <button
              className="btn btn-primary ps-order-place-btn"
              onClick={handlePlaceOrder}
              disabled={submitting}
            >
              {submitting ? 'Processing...' : `Place Order \u2014 ${formatPrice(quote.totalCostCents, quote.currency)}`}
            </button>
            <button
              className="btn btn-outline"
              onClick={() => setStep(3)}
              disabled={submitting}
            >
              Back
            </button>
          </div>

          <p className="ps-order-stripe-note">
            You will be redirected to Stripe to complete your payment securely.
          </p>
        </div>
      )}
    </div>
  );
}
