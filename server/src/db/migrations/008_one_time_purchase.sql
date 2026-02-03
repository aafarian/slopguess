-- Migration: 008_one_time_purchase
-- Description: Convert subscription model from recurring to one-time payment.
--   - Drop subscription-specific columns (and their indexes/constraints first)
--   - Add payment intent tracking columns
--   - Update status constraint for one-time purchase model

-- ============================================================================
-- UP
-- ============================================================================

-- Drop index and constraint on stripe_subscription_id BEFORE dropping the column
DROP INDEX IF EXISTS idx_subscriptions_stripe_subscription_id;
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_stripe_subscription_id_unique;

-- Drop subscription-specific columns
ALTER TABLE subscriptions DROP COLUMN IF EXISTS stripe_subscription_id;
ALTER TABLE subscriptions DROP COLUMN IF EXISTS current_period_start;
ALTER TABLE subscriptions DROP COLUMN IF EXISTS current_period_end;
ALTER TABLE subscriptions DROP COLUMN IF EXISTS cancel_at_period_end;

-- Add one-time payment columns
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT NULL;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS purchased_at TIMESTAMPTZ NULL;

-- Migrate any existing rows with statuses incompatible with the new constraint
UPDATE subscriptions SET status = 'active' WHERE status NOT IN ('active', 'purchased');

-- Update status constraint: replace subscription statuses with purchase statuses
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_status_check CHECK (status IN ('active', 'purchased'));
