-- 10_remove_users_tags.sql
-- This migration removes the tags column from the users table
-- The classusers tags migration is handled in the JS migration file

CREATE TABLE IF NOT EXISTS "users_temp"
(
    "id"          INTEGER NOT NULL UNIQUE,
    "email"       TEXT    NOT NULL,
    "password"    TEXT,
    "permissions" INTEGER,
    "API"         TEXT    NOT NULL UNIQUE,
    "secret"      TEXT    NOT NULL UNIQUE,
    "digipogs"    INTEGER NOT NULL DEFAULT 0,
    "pin"         INTEGER,
    "displayName" TEXT,
    "verified"    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY ("id" AUTOINCREMENT)
);

-- Remove tags column from users table by recreating it without the column
INSERT INTO users_temp (
    id, email, password, permissions, API, secret, digipogs, pin, displayName, verified
)
SELECT
    id, email, password, permissions, API, secret, digipogs, pin, displayName, verified
FROM users;

-- Drop the old users table and rename the new one
DROP TABLE users;
ALTER TABLE users_temp RENAME TO users;