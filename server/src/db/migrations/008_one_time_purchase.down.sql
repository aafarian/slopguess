-- Migration: 008_one_time_purchase (DOWN)
-- Description: Revert one-time purchase model back to recurring subscription model.

-- Drop one-time payment columns
ALTER TABLE subscriptions DROP COLUMN IF EXISTS stripe_payment_intent_id;
ALTER TABLE subscriptions DROP COLUMN IF EXISTS purchased_at;

-- Re-add subscription-specific columns
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT NULL;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS current_period_start TIMESTAMPTZ NULL;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ NULL;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN DEFAULT FALSE;

-- Migrate any 'purchased' rows back to 'active' before re-adding old constraint
UPDATE subscriptions SET status = 'active' WHERE status = 'purchased';

-- Restore original status constraint
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_status_check CHECK (status IN ('active', 'past_due', 'canceled', 'incomplete'));

-- Re-add index and unique constraint on stripe_subscription_id
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_subscription_id ON subscriptions (stripe_subscription_id);
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_stripe_subscription_id_unique UNIQUE (stripe_subscription_id);
