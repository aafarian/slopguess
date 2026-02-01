-- Migration: 002_add_embedding_columns (DOWN / rollback)
-- Description: Remove embedding columns from rounds and guesses tables.

ALTER TABLE guesses
  DROP COLUMN IF EXISTS guess_embedding;

ALTER TABLE rounds
  DROP COLUMN IF EXISTS prompt_embedding;
