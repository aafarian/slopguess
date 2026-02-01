-- Rollback migration 004: Remove prompt_source column from rounds table

ALTER TABLE rounds DROP COLUMN IF EXISTS prompt_source;
