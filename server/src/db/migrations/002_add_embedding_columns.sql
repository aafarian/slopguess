-- Migration: 002_add_embedding_columns
-- Description: Add embedding columns to rounds and guesses tables for storing
--              pre-computed embedding vectors used in similarity scoring.

-- ============================================================================
-- UP
-- ============================================================================

-- Store the prompt's embedding vector so it can be compared against guess
-- embeddings without re-computing on every score calculation.
ALTER TABLE rounds
  ADD COLUMN IF NOT EXISTS prompt_embedding FLOAT[];

-- Store the guess's embedding vector alongside the guess for the same reason.
ALTER TABLE guesses
  ADD COLUMN IF NOT EXISTS guess_embedding FLOAT[];
