-- Migration: 007_subscriptions (DOWN)
-- Description: Drop subscriptions and analytics_events tables, remove subscription_tier from users

DROP TABLE IF EXISTS analytics_events CASCADE;
DROP TABLE IF EXISTS subscriptions CASCADE;
ALTER TABLE users DROP COLUMN IF EXISTS subscription_tier;
