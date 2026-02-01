-- Migration: 001_initial_schema (DOWN / rollback)
-- Description: Drop all core Slop Guess tables

DROP TABLE IF EXISTS round_words CASCADE;
DROP TABLE IF EXISTS guesses CASCADE;
DROP TABLE IF EXISTS rounds CASCADE;
DROP TABLE IF EXISTS word_bank CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP EXTENSION IF EXISTS pgcrypto;
