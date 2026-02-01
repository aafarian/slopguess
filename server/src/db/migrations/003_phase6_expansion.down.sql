-- Migration: 003_phase6_expansion (DOWN / rollback)
-- Description: Reverse all Phase 6 expansion schema changes.

-- Drop the user_streaks table (includes its index)
DROP TABLE IF EXISTS user_streaks CASCADE;

-- Remove element_scores column from guesses
ALTER TABLE guesses
  DROP COLUMN IF EXISTS element_scores;

-- Remove word_count column from rounds
ALTER TABLE rounds
  DROP COLUMN IF EXISTS word_count;

-- Remove difficulty column from rounds
ALTER TABLE rounds
  DROP COLUMN IF EXISTS difficulty;
