-- Migration: 006_notifications
-- Description: Create notifications table for persistent notification storage

-- ============================================================================
-- UP
-- ============================================================================

CREATE TABLE IF NOT EXISTS notifications (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type            VARCHAR(30)     NOT NULL,
    data            JSONB           NOT NULL DEFAULT '{}',
    read            BOOLEAN         NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT notifications_type_check CHECK (type IN (
        'friend_request', 'friend_accepted',
        'challenge_received', 'challenge_guessed',
        'new_message'
    ))
);

-- --------------------------------------------------------------------------
-- Indexes
-- --------------------------------------------------------------------------

-- Primary lookup: all notifications for a user, newest first
CREATE INDEX IF NOT EXISTS idx_notifications_user_id
    ON notifications (user_id, created_at DESC);

-- Fast unread count: partial index on unread only
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
    ON notifications (user_id) WHERE read = FALSE;
