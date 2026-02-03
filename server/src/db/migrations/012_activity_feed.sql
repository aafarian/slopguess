-- Migration: 012_activity_feed
-- Description: Create activity_events table for social activity feed

-- ============================================================================
-- UP
-- ============================================================================

-- --------------------------------------------------------------------------
-- activity_events
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS activity_events (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_type      VARCHAR(30)     NOT NULL,
    data            JSONB           NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT activity_events_event_type_check CHECK (event_type IN ('game_played', 'achievement_unlocked', 'challenge_completed', 'level_up'))
);

-- --------------------------------------------------------------------------
-- Indexes
-- --------------------------------------------------------------------------

-- User feed: filter by user, newest first
CREATE INDEX IF NOT EXISTS idx_activity_events_user_created
    ON activity_events (user_id, created_at DESC);

-- Global / friend feed: newest first scan
CREATE INDEX IF NOT EXISTS idx_activity_events_created
    ON activity_events (created_at DESC);
