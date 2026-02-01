-- Migration: 003_phase6_expansion
-- Description: Add difficulty and word_count to rounds, element_scores to guesses,
--              and create user_streaks table for streak tracking.

-- ============================================================================
-- UP
-- ============================================================================

-- --------------------------------------------------------------------------
-- rounds: add difficulty column
-- --------------------------------------------------------------------------
-- Tracks the difficulty setting chosen for this round.
-- Defaults to 'normal' so existing rows remain valid.
ALTER TABLE rounds
  ADD COLUMN IF NOT EXISTS difficulty VARCHAR(20) DEFAULT 'normal';

-- --------------------------------------------------------------------------
-- rounds: add word_count column
-- --------------------------------------------------------------------------
-- Records how many words the prompt contained, which correlates with
-- difficulty / prompt complexity.
ALTER TABLE rounds
  ADD COLUMN IF NOT EXISTS word_count INT;

-- --------------------------------------------------------------------------
-- guesses: add element_scores column
-- --------------------------------------------------------------------------
-- Stores a per-element score breakdown as JSONB:
-- {
--   "matchedWords": ["word1", "word2"],
--   "partialMatches": [{ "word": "word3", "similarity": 0.72 }],
--   "elementScore": 85.5
-- }
ALTER TABLE guesses
  ADD COLUMN IF NOT EXISTS element_scores JSONB;

-- --------------------------------------------------------------------------
-- user_streaks: new table for tracking daily play streaks
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_streaks (
    user_id           UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    current_streak    INT           NOT NULL DEFAULT 0,
    longest_streak    INT           NOT NULL DEFAULT 0,
    last_played_date  DATE,
    updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    CONSTRAINT user_streaks_user_id_unique UNIQUE (user_id)
);

-- --------------------------------------------------------------------------
-- Indexes
-- --------------------------------------------------------------------------

-- user_streaks: fast lookup by user_id (also enforced by UNIQUE constraint,
-- but an explicit index name keeps things consistent with project conventions)
CREATE INDEX IF NOT EXISTS idx_user_streaks_user_id ON user_streaks (user_id);
