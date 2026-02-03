-- Migration: 010_xp_levels
-- Description: Add XP and level columns to users table for progression system

-- ============================================================================
-- UP
-- ============================================================================

-- Add XP column (total accumulated experience points)
ALTER TABLE users ADD COLUMN IF NOT EXISTS xp INTEGER NOT NULL DEFAULT 0;

-- Add level column (derived from XP, cached for fast reads)
ALTER TABLE users ADD COLUMN IF NOT EXISTS level INTEGER NOT NULL DEFAULT 1;

-- Index for leaderboard-style queries ordered by XP
CREATE INDEX IF NOT EXISTS idx_users_xp ON users (xp DESC);

-- Index for level-based filtering
CREATE INDEX IF NOT EXISTS idx_users_level ON users (level DESC);
