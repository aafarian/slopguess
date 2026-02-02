-- Migration: 007_subscriptions
-- Description: Create subscriptions and analytics_events tables, add subscription_tier to users (Phase 10)

-- ============================================================================
-- UP
-- ============================================================================

-- --------------------------------------------------------------------------
-- subscriptions
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscriptions (
    id                      UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stripe_customer_id      TEXT            NOT NULL,
    stripe_subscription_id  TEXT            NULL,
    tier                    VARCHAR(20)     NOT NULL DEFAULT 'free',
    status                  VARCHAR(20)     NOT NULL DEFAULT 'active',
    current_period_start    TIMESTAMPTZ     NULL,
    current_period_end      TIMESTAMPTZ     NULL,
    cancel_at_period_end    BOOLEAN         NOT NULL DEFAULT FALSE,
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT subscriptions_user_id_unique UNIQUE (user_id),
    CONSTRAINT subscriptions_stripe_customer_id_unique UNIQUE (stripe_customer_id),
    CONSTRAINT subscriptions_stripe_subscription_id_unique UNIQUE (stripe_subscription_id),
    CONSTRAINT subscriptions_tier_check CHECK (tier IN ('free', 'pro')),
    CONSTRAINT subscriptions_status_check CHECK (status IN ('active', 'past_due', 'canceled', 'incomplete'))
);

-- --------------------------------------------------------------------------
-- analytics_events
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analytics_events (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID            NULL REFERENCES users(id) ON DELETE SET NULL,
    event_type      VARCHAR(50)     NOT NULL,
    metadata        JSONB           NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- --------------------------------------------------------------------------
-- ALTER users: add subscription_tier for fast lookups
-- --------------------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_tier VARCHAR(20) NOT NULL DEFAULT 'free';

-- --------------------------------------------------------------------------
-- Indexes
-- --------------------------------------------------------------------------

-- subscriptions: lookup by user, stripe customer, stripe subscription
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id
    ON subscriptions (user_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer_id
    ON subscriptions (stripe_customer_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_subscription_id
    ON subscriptions (stripe_subscription_id);

-- analytics_events: lookup by event type and time range
CREATE INDEX IF NOT EXISTS idx_analytics_events_type_created
    ON analytics_events (event_type, created_at);
