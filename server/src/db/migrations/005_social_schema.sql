-- Migration: 005_social_schema
-- Description: Create social tables for friendships, challenges, and messages (Phase 9)

-- ============================================================================
-- UP
-- ============================================================================

-- --------------------------------------------------------------------------
-- friendships
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS friendships (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id       UUID            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id     UUID            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status          VARCHAR(20)     NOT NULL DEFAULT 'pending',
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT friendships_status_check CHECK (status IN ('pending', 'accepted', 'declined', 'blocked')),
    CONSTRAINT friendships_sender_receiver_unique UNIQUE (sender_id, receiver_id)
);

-- --------------------------------------------------------------------------
-- challenges
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS challenges (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    challenger_id       UUID            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    challenged_id       UUID            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    prompt              TEXT            NOT NULL,
    image_url           TEXT,
    prompt_embedding    FLOAT[],
    challenger_score    FLOAT           NULL,
    challenged_score    FLOAT           NULL,
    challenged_guess    TEXT            NULL,
    status              VARCHAR(20)     NOT NULL DEFAULT 'pending',
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT challenges_status_check CHECK (status IN ('pending', 'active', 'guessed', 'completed', 'expired', 'declined'))
);

-- --------------------------------------------------------------------------
-- messages
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS messages (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id       UUID            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id     UUID            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content         TEXT            NOT NULL,
    read            BOOLEAN         NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- --------------------------------------------------------------------------
-- Indexes
-- --------------------------------------------------------------------------

-- friendships: lookup by sender, receiver, and status filtering
CREATE INDEX IF NOT EXISTS idx_friendships_sender_id   ON friendships (sender_id);
CREATE INDEX IF NOT EXISTS idx_friendships_receiver_id ON friendships (receiver_id);
CREATE INDEX IF NOT EXISTS idx_friendships_status      ON friendships (status);

-- challenges: lookup by both user IDs and status filtering
CREATE INDEX IF NOT EXISTS idx_challenges_challenger_id ON challenges (challenger_id);
CREATE INDEX IF NOT EXISTS idx_challenges_challenged_id ON challenges (challenged_id);
CREATE INDEX IF NOT EXISTS idx_challenges_status        ON challenges (status);

-- messages: lookup by sender, receiver, and composite conversation lookup
CREATE INDEX IF NOT EXISTS idx_messages_sender_id   ON messages (sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_receiver_id ON messages (receiver_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages (sender_id, receiver_id, created_at DESC);
