-- Migration: 009_achievements
-- Description: Create achievement system tables and seed initial achievement definitions

-- ============================================================================
-- UP
-- ============================================================================

-- --------------------------------------------------------------------------
-- achievement_definitions
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS achievement_definitions (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    key             VARCHAR(50)     NOT NULL,
    title           VARCHAR(100)    NOT NULL,
    description     TEXT            NOT NULL,
    icon            VARCHAR(10)     NOT NULL,
    category        VARCHAR(20)     NOT NULL,
    threshold_value INTEGER         NOT NULL DEFAULT 1,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT achievement_definitions_key_unique UNIQUE (key),
    CONSTRAINT achievement_definitions_category_check CHECK (category IN ('score', 'streak', 'social', 'volume'))
);

-- --------------------------------------------------------------------------
-- user_achievements
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_achievements (
    id                      UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    achievement_id          UUID            NOT NULL REFERENCES achievement_definitions(id) ON DELETE CASCADE,
    progress                INTEGER         NOT NULL DEFAULT 0,
    unlocked_at             TIMESTAMPTZ     NULL,
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT user_achievements_user_achievement_unique UNIQUE (user_id, achievement_id)
);

-- --------------------------------------------------------------------------
-- Indexes
-- --------------------------------------------------------------------------

-- achievement_definitions: lookup by key and category
CREATE INDEX IF NOT EXISTS idx_achievement_definitions_key      ON achievement_definitions (key);
CREATE INDEX IF NOT EXISTS idx_achievement_definitions_category ON achievement_definitions (category);

-- user_achievements: lookup by user, by achievement, and unlocked filtering
CREATE INDEX IF NOT EXISTS idx_user_achievements_user_id        ON user_achievements (user_id);
CREATE INDEX IF NOT EXISTS idx_user_achievements_achievement_id ON user_achievements (achievement_id);
CREATE INDEX IF NOT EXISTS idx_user_achievements_unlocked       ON user_achievements (user_id, unlocked_at)
    WHERE unlocked_at IS NOT NULL;

-- --------------------------------------------------------------------------
-- Seed: 14 initial achievement definitions
-- --------------------------------------------------------------------------
INSERT INTO achievement_definitions (key, title, description, icon, category, threshold_value)
VALUES
    -- Score achievements
    ('first_guess',  'First Steps',       'Submit your first guess',                              '🎯', 'score',  1),
    ('score_50',     'Getting Warmer',    'Score 50% or higher on a single round',                '🔥', 'score',  50),
    ('score_80',     'Sharp Eye',         'Score 80% or higher on a single round',                '👁️', 'score',  80),
    ('score_95',     'Nearly Perfect',    'Score 95% or higher on a single round',                '🌟', 'score',  95),
    ('perfect_100',  'Pixel Perfect',     'Score a perfect 100% on a single round',               '💎', 'score',  100),

    -- Streak achievements
    ('streak_3',     'On a Roll',         'Achieve a 3-day streak',                               '🔗', 'streak', 3),
    ('streak_7',     'Week Warrior',      'Achieve a 7-day streak',                               '⚡', 'streak', 7),
    ('streak_30',    'Unstoppable',       'Achieve a 30-day streak',                              '👑', 'streak', 30),

    -- Social achievements
    ('first_friend',    'Social Butterfly',  'Add your first friend',                             '🤝', 'social', 1),
    ('first_challenge', 'Challenger',        'Send your first challenge',                         '⚔️', 'social', 1),
    ('challenge_win',   'Victor',            'Win your first challenge',                          '🏆', 'social', 1),

    -- Volume achievements
    ('rounds_10',    'Getting Started',   'Complete 10 rounds',                                   '📝', 'volume', 10),
    ('rounds_50',    'Dedicated Player',  'Complete 50 rounds',                                   '🎮', 'volume', 50),
    ('rounds_100',   'Centurion',         'Complete 100 rounds',                                  '💯', 'volume', 100)
ON CONFLICT (key) DO NOTHING;
