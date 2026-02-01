-- Migration: 001_initial_schema
-- Description: Create core tables for Slop Guess (users, word_bank, rounds, guesses, round_words)

-- ============================================================================
-- UP
-- ============================================================================

-- Enable gen_random_uuid() for UUID generation (PostgreSQL 13+ has it built-in,
-- but pgcrypto provides it for older versions as well)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- --------------------------------------------------------------------------
-- users
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    username        VARCHAR(20)     NOT NULL,
    email           VARCHAR(255)    NOT NULL,
    password_hash   VARCHAR(255)    NOT NULL,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT users_username_unique UNIQUE (username),
    CONSTRAINT users_email_unique    UNIQUE (email)
);

-- --------------------------------------------------------------------------
-- word_bank
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS word_bank (
    id              SERIAL          PRIMARY KEY,
    word            VARCHAR(100)    NOT NULL,
    category        VARCHAR(50)     NOT NULL,
    last_used_at    TIMESTAMPTZ     NULL,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT word_bank_word_unique UNIQUE (word)
);

-- --------------------------------------------------------------------------
-- rounds
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rounds (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    prompt          TEXT            NOT NULL,
    image_url       TEXT,
    status          VARCHAR(20)     NOT NULL DEFAULT 'pending',
    started_at      TIMESTAMPTZ,
    ended_at        TIMESTAMPTZ,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT rounds_status_check CHECK (status IN ('pending', 'active', 'completed'))
);

-- --------------------------------------------------------------------------
-- guesses
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS guesses (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    round_id                UUID        NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
    user_id                 UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    guess_text              TEXT        NOT NULL,
    score                   FLOAT,
    embedding_similarity    FLOAT,
    submitted_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT guesses_one_per_user_per_round UNIQUE (round_id, user_id)
);

-- --------------------------------------------------------------------------
-- round_words (junction table: which words were used in each round's prompt)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS round_words (
    round_id    UUID    NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
    word_id     INTEGER NOT NULL REFERENCES word_bank(id) ON DELETE CASCADE,

    PRIMARY KEY (round_id, word_id)
);

-- --------------------------------------------------------------------------
-- Indexes
-- --------------------------------------------------------------------------

-- guesses: lookup by round, by user, and leaderboard ordering
CREATE INDEX IF NOT EXISTS idx_guesses_round_id       ON guesses (round_id);
CREATE INDEX IF NOT EXISTS idx_guesses_user_id        ON guesses (user_id);
CREATE INDEX IF NOT EXISTS idx_guesses_round_score     ON guesses (round_id, score DESC);

-- word_bank: filter by category, sort by last usage for recency-based selection
CREATE INDEX IF NOT EXISTS idx_word_bank_category      ON word_bank (category);
CREATE INDEX IF NOT EXISTS idx_word_bank_last_used     ON word_bank (last_used_at);

-- rounds: filter by status (active rounds query)
CREATE INDEX IF NOT EXISTS idx_rounds_status           ON rounds (status);

-- round_words: lookup words by round (already covered by PK), lookup rounds by word
CREATE INDEX IF NOT EXISTS idx_round_words_word_id     ON round_words (word_id);


-- ============================================================================
-- DOWN (rollback)
-- ============================================================================
-- To rollback this migration, run the following statements:
--
-- DROP TABLE IF EXISTS round_words CASCADE;
-- DROP TABLE IF EXISTS guesses CASCADE;
-- DROP TABLE IF EXISTS rounds CASCADE;
-- DROP TABLE IF EXISTS word_bank CASCADE;
-- DROP TABLE IF EXISTS users CASCADE;
-- DROP EXTENSION IF EXISTS pgcrypto;
