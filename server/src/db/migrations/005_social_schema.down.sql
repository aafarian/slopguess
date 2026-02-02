-- Migration: 005_social_schema (DOWN / rollback)
-- Description: Drop all social tables (Phase 9)

DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS challenges CASCADE;
DROP TABLE IF EXISTS friendships CASCADE;
