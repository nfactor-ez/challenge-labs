-- ═══════════════════════════════════════════════════════════
-- ChallengeLabs — PostgreSQL Schema
-- Generated from GORM models in internal/models/models.go
-- Run with: psql -U postgres -d challengelabs -f schema.sql
-- ═══════════════════════════════════════════════════════════

-- ─── Extensions ───────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── Users ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at    TIMESTAMPTZ,          -- soft-delete via GORM

    username      VARCHAR(50)  NOT NULL UNIQUE,
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT         NOT NULL,
    role          VARCHAR(20)  NOT NULL DEFAULT 'user'
                    CHECK (role IN ('user', 'admin')),
    avatar_url    VARCHAR(500)
);

CREATE INDEX IF NOT EXISTS idx_users_deleted_at  ON users(deleted_at);
CREATE INDEX IF NOT EXISTS idx_users_username     ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email        ON users(email);

-- ─── Categories ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
    id          SERIAL PRIMARY KEY,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    name        VARCHAR(100) NOT NULL UNIQUE,
    slug        VARCHAR(100) NOT NULL UNIQUE,
    description TEXT
);

CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);

-- ─── Challenges ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS challenges (
    id           SERIAL PRIMARY KEY,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at   TIMESTAMPTZ,          -- soft-delete via GORM

    title        VARCHAR(200) NOT NULL,
    slug         VARCHAR(200) NOT NULL UNIQUE,
    description  TEXT,
    difficulty   VARCHAR(20)  NOT NULL
                   CHECK (difficulty IN ('easy', 'medium', 'hard')),
    points       INTEGER      NOT NULL DEFAULT 100,
    docker_image VARCHAR(300) NOT NULL,
    flag         VARCHAR(500) NOT NULL,  -- bcrypt-hashed before storage
    tags         VARCHAR(500),           -- comma-separated tag list
    is_published BOOLEAN      NOT NULL DEFAULT FALSE,

    category_id  INTEGER NOT NULL
                   REFERENCES categories(id)
                   ON UPDATE CASCADE
                   ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_challenges_deleted_at   ON challenges(deleted_at);
CREATE INDEX IF NOT EXISTS idx_challenges_slug         ON challenges(slug);
CREATE INDEX IF NOT EXISTS idx_challenges_category_id  ON challenges(category_id);
CREATE INDEX IF NOT EXISTS idx_challenges_is_published ON challenges(is_published);

-- ─── Tasks ────────────────────────────────────────────────────────────────────
-- Step-by-step guidance attached to a challenge. Ordered by `order` ASC.
CREATE TABLE IF NOT EXISTS tasks (
    id           SERIAL PRIMARY KEY,

    challenge_id INTEGER  NOT NULL
                   REFERENCES challenges(id)
                   ON DELETE CASCADE,   -- tasks are removed when challenge is deleted
    "order"      INTEGER  NOT NULL,
    title        VARCHAR(300) NOT NULL,
    description  TEXT,
    is_required  BOOLEAN  NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_tasks_challenge_id ON tasks(challenge_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_challenge_order ON tasks(challenge_id, "order");

-- ─── Sessions ─────────────────────────────────────────────────────────────────
-- One session = one Docker container instance for a user+challenge pair.
CREATE TABLE IF NOT EXISTS sessions (
    id             SERIAL PRIMARY KEY,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at     TIMESTAMPTZ,          -- soft-delete via GORM

    user_id        INTEGER NOT NULL
                     REFERENCES users(id)
                     ON DELETE CASCADE,
    challenge_id   INTEGER
                     REFERENCES challenges(id)
                     ON DELETE SET NULL,
    container_id   VARCHAR(100),         -- Docker container ID (64-char hex)
    session_key    VARCHAR(64)  NOT NULL UNIQUE,
    status         VARCHAR(20)  NOT NULL DEFAULT 'booting'
                     CHECK (status IN ('booting','active','terminating','expired','error')),
    container_ip   VARCHAR(50),          -- Internal Docker network IP
    expires_at     TIMESTAMPTZ NOT NULL,
    last_active_at TIMESTAMPTZ           -- Updated by WebSocket heartbeat
);

CREATE INDEX IF NOT EXISTS idx_sessions_deleted_at    ON sessions(deleted_at);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id       ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_challenge_id  ON sessions(challenge_id);
CREATE INDEX IF NOT EXISTS idx_sessions_container_id  ON sessions(container_id);
CREATE INDEX IF NOT EXISTS idx_sessions_session_key   ON sessions(session_key);
CREATE INDEX IF NOT EXISTS idx_sessions_status        ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at    ON sessions(expires_at);

-- ─── User Progress ────────────────────────────────────────────────────────────
-- Tracks completion state and points awarded per user-challenge pair.
-- Unique constraint ensures one record per (user, challenge).
CREATE TABLE IF NOT EXISTS user_progresses (
    id              SERIAL PRIMARY KEY,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    user_id         INTEGER NOT NULL
                      REFERENCES users(id)
                      ON DELETE CASCADE,
    challenge_id    INTEGER NOT NULL
                      REFERENCES challenges(id)
                      ON DELETE CASCADE,
    completed       BOOLEAN NOT NULL DEFAULT FALSE,
    flag_submitted  BOOLEAN NOT NULL DEFAULT FALSE,
    points_awarded  INTEGER NOT NULL DEFAULT 0,
    completed_at    TIMESTAMPTZ,

    CONSTRAINT uq_user_challenge UNIQUE (user_id, challenge_id)
);

CREATE INDEX IF NOT EXISTS idx_user_progresses_user_id      ON user_progresses(user_id);
CREATE INDEX IF NOT EXISTS idx_user_progresses_challenge_id ON user_progresses(challenge_id);
CREATE INDEX IF NOT EXISTS idx_user_progresses_completed    ON user_progresses(completed);

-- ─── Views (optional helpers) ─────────────────────────────────────────────────

-- Leaderboard view: total points + challenges solved per user
CREATE OR REPLACE VIEW leaderboard AS
SELECT
    u.id         AS user_id,
    u.username,
    u.avatar_url,
    COALESCE(SUM(up.points_awarded), 0)::INTEGER AS total_points,
    COUNT(up.id)::INTEGER                        AS challenges_solved,
    RANK() OVER (ORDER BY COALESCE(SUM(up.points_awarded), 0) DESC) AS rank
FROM users u
LEFT JOIN user_progresses up ON up.user_id = u.id AND up.completed = TRUE
WHERE u.deleted_at IS NULL
GROUP BY u.id, u.username, u.avatar_url
ORDER BY total_points DESC;

-- ─── Seed: initial admin user ─────────────────────────────────────────────────
-- Password: changeme123 (bcrypt cost 10)
-- IMPORTANT: Change this password immediately after first login!
-- INSERT INTO users (username, email, password_hash, role)
-- VALUES (
--   'admin',
--   'admin@challengelabs.local',
--   '$2a$10$examplehashchangeme',
--   'admin'
-- ) ON CONFLICT DO NOTHING;
