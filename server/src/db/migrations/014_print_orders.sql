-- Print orders table for the print shop feature.
-- Tracks orders for framed prints of AI-generated round images.
-- Status lifecycle: pending -> paid -> submitted -> in_production -> shipped -> delivered
-- Also supports: cancelled, failed

CREATE TABLE print_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  round_id UUID NOT NULL REFERENCES rounds(id),
  prodigi_order_id VARCHAR(255),
  stripe_payment_intent_id VARCHAR(255),
  sku VARCHAR(100) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  base_cost_cents INTEGER NOT NULL,
  margin_cents INTEGER NOT NULL,
  total_cost_cents INTEGER NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  shipping_name VARCHAR(255) NOT NULL,
  shipping_line1 VARCHAR(255) NOT NULL,
  shipping_line2 VARCHAR(255),
  shipping_city VARCHAR(255) NOT NULL,
  shipping_state VARCHAR(255),
  shipping_postal_code VARCHAR(20) NOT NULL,
  shipping_country VARCHAR(2) NOT NULL,
  image_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_print_orders_user_id ON print_orders(user_id);
CREATE INDEX idx_print_orders_status ON print_orders(status);
