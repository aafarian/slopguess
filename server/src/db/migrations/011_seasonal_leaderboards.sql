-- Migration: 011_seasonal_leaderboards
-- Description: Create leaderboard_entries table for time-based aggregated leaderboards (weekly, monthly, all-time)

-- ============================================================================
-- UP
-- ============================================================================

-- --------------------------------------------------------------------------
-- leaderboard_entries
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS leaderboard_entries (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    period_type     VARCHAR(20)     NOT NULL,
    period_key      VARCHAR(20)     NOT NULL,
    total_score     INTEGER         NOT NULL DEFAULT 0,
    games_played    INTEGER         NOT NULL DEFAULT 0,
    average_score   NUMERIC(10, 2)  NOT NULL DEFAULT 0,
    best_score      INTEGER         NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT leaderboard_entries_period_type_check CHECK (period_type IN ('weekly', 'monthly', 'all_time')),
    CONSTRAINT leaderboard_entries_user_period_unique UNIQUE (user_id, period_type, period_key)
);

-- --------------------------------------------------------------------------
-- Indexes
-- --------------------------------------------------------------------------

-- Fast leaderboard queries: filter by period_type + period_key, order by score
CREATE INDEX IF NOT EXISTS idx_leaderboard_entries_period
    ON leaderboard_entries (period_type, period_key, total_score DESC);

-- Fast lookup by user
CREATE INDEX IF NOT EXISTS idx_leaderboard_entries_user_id
    ON leaderboard_entries (user_id);

-- Average score ordering for leaderboard queries
CREATE INDEX IF NOT EXISTS idx_leaderboard_entries_avg_score
    ON leaderboard_entries (period_type, period_key, average_score DESC);
