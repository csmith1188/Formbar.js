-- 01_convert_users.sql
-- This migration modifies the users table to add email and remove username
-- It also migrates existing data to ensure email uniqueness by appending a placeholder domain if necessary
-- Additionally, creates the refresh_tokens table if it does not already exist.

CREATE TABLE IF NOT EXISTS refresh_tokens
(
    user_id       INTEGER,
    refresh_token TEXT    NOT NULL UNIQUE,
    exp           INTEGER NOT NULL
);


CREATE TABLE IF NOT EXISTS "users_temp"
(
    "id"          INTEGER NOT NULL UNIQUE,
    "email"       TEXT    NOT NULL UNIQUE,
    "password"    TEXT,
    "permissions" INTEGER,
    "API"         TEXT    NOT NULL UNIQUE,
    "secret"      TEXT    NOT NULL UNIQUE,
    "tags"        TEXT,
    "digipogs"    INTEGER NOT NULL DEFAULT 0,
    "pin"         INTEGER DEFAULT NULL,
    "displayName" TEXT,
    "verified"    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY ("id" AUTOINCREMENT)
);

ALTER TABLE users ADD COLUMN pin DEFAULT NULL;

INSERT INTO users_temp (
    id, password, permissions, API, secret, tags, displayName, email, digipogs, verified, pin
)
SELECT
    id, password, permissions, API, secret, tags, displayName,
    COALESCE(email, id || '@placeholder.com') AS email,  -- keep existing email if present, otherwise use placeholder
    digipogs,
    verified,
    COALESCE(pin, NULL) AS pin
FROM users;

DROP TABLE users;
ALTER TABLE users_temp RENAME TO users;