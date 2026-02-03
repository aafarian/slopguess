-- Migration: 013_group_challenges
-- Description: Create tables for group challenges (3+ player challenges)
--
-- Group challenges extend the 1v1 challenge concept. A creator writes a prompt
-- that generates an AI image, then invites 2-10 friends to guess the prompt.
-- The creator is NOT a participant who guesses.

-- ============================================================================
-- UP
-- ============================================================================

-- --------------------------------------------------------------------------
-- group_challenges — one row per group challenge
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS group_challenges (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id          UUID            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    prompt              TEXT            NOT NULL,
    image_url           TEXT,
    prompt_embedding    FLOAT[],
    status              VARCHAR(20)     NOT NULL DEFAULT 'pending',
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT group_challenges_status_check CHECK (
        status IN ('pending', 'active', 'scoring', 'completed', 'expired')
    )
);

-- --------------------------------------------------------------------------
-- group_challenge_participants — one row per invited participant
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS group_challenge_participants (
    id                      UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    group_challenge_id      UUID            NOT NULL REFERENCES group_challenges(id) ON DELETE CASCADE,
    user_id                 UUID            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    guess_text              TEXT            NULL,
    score                   FLOAT           NULL,
    status                  VARCHAR(20)     NOT NULL DEFAULT 'pending',
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT gcp_status_check CHECK (
        status IN ('pending', 'joined', 'guessed', 'declined')
    ),
    CONSTRAINT gcp_challenge_user_unique UNIQUE (group_challenge_id, user_id)
);

-- --------------------------------------------------------------------------
-- Indexes
-- --------------------------------------------------------------------------

-- group_challenges: lookup by creator and status
CREATE INDEX IF NOT EXISTS idx_group_challenges_creator_id ON group_challenges (creator_id);
CREATE INDEX IF NOT EXISTS idx_group_challenges_status     ON group_challenges (status);

-- group_challenge_participants: lookup by challenge, user, and status
CREATE INDEX IF NOT EXISTS idx_gcp_group_challenge_id ON group_challenge_participants (group_challenge_id);
CREATE INDEX IF NOT EXISTS idx_gcp_user_id            ON group_challenge_participants (user_id);
CREATE INDEX IF NOT EXISTS idx_gcp_status             ON group_challenge_participants (status);
