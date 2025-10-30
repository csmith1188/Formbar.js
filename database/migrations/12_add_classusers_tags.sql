-- 12_add_classusers_tags.sql
-- This migration adds a tags column to the classusers table
-- to store student tags per class instead of system-wide

-- Create a new classusers table with the tags column
CREATE TABLE IF NOT EXISTS "classusers_temp"
(
    "classId"     INTEGER NOT NULL,
    "studentId"   INTEGER NOT NULL,
    "permissions" INTEGER NOT NULL,
    "tags"        TEXT
);

-- Copy existing data from classusers to the new table
INSERT INTO classusers_temp (
    classId, studentId, permissions, tags
)
SELECT
    classId,
    studentId,
    permissions,
    NULL
FROM classusers;

-- Migrate existing tags from users table to classusers table
-- For each user-class combination, copy their tags
UPDATE classusers_temp
SET tags = (
    SELECT users.tags
    FROM users
    WHERE users.id = classusers_temp.studentId
);

-- Drop the old classusers table and rename the new one
DROP TABLE classusers;
ALTER TABLE classusers_temp RENAME TO classusers;

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