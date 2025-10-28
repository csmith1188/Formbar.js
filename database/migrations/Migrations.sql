-- 01: Modernize Users Table

-- This migration:
-- - Creates refresh_tokens table
-- - Removes username column from users
-- - Adds email, digipogs, verified, and pin columns to users
-- - Migrates existing data with placeholder emails where needed

CREATE TABLE IF NOT EXISTS refresh_tokens
(
    user_id       INTEGER,
    refresh_token TEXT    NOT NULL UNIQUE,
    exp           INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS "users_temp"
(
    "id"          INTEGER NOT NULL UNIQUE,
    "email"       TEXT    NOT NULL,
    "password"    TEXT,
    "permissions" INTEGER,
    "API"         TEXT    NOT NULL UNIQUE,
    "secret"      TEXT    NOT NULL UNIQUE,
    "tags"        TEXT,
    "digipogs"    INTEGER NOT NULL DEFAULT 0,
    "pin"         INTEGER,
    "displayName" TEXT,
    "verified"    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY ("id" AUTOINCREMENT)
);

INSERT INTO users_temp (
    id, password, permissions, API, secret, tags, displayName, email, digipogs, verified
)
SELECT
    id, password, permissions, API, secret, tags, displayName,
    COALESCE(email, '_' || id || '@placeholder.com') AS email,
    COALESCE(digipogs, 0) AS digipogs,
    COALESCE(verified, 0) AS verified
FROM users;

DROP TABLE users;
ALTER TABLE users_temp RENAME TO users;


-- 06: Add Links Table

-- This migration creates the links table to store links associated with classes.

CREATE TABLE IF NOT EXISTS "links"
(
    "id"          INTEGER NOT NULL UNIQUE,
    "name"        TEXT    NOT NULL,
    "url"         TEXT    NOT NULL,
    "classId"     INTEGER NOT NULL,
    PRIMARY KEY ("id" AUTOINCREMENT)
);

-- 07: Poll Vote Changes

-- This migration adds the allowVoteChanges column to the custom_polls table,
-- defaulting to 1 (true) for existing polls.

CREATE TABLE IF NOT EXISTS "custom_polls_temp"
(
    "id"                INTEGER NOT NULL UNIQUE,
    "owner"             TEXT,
    "name"              TEXT,
    "prompt"            TEXT,
    "answers"           TEXT    NOT NULL,
    "textRes"           INTEGER NOT NULL DEFAULT 0 CHECK ("textRes" IN (0, 1)),
    "blind"             INTEGER NOT NULL DEFAULT 0 CHECK ("blind" IN (0, 1)),
    "allowVoteChanges"  INTEGER NOT NULL DEFAULT 1 CHECK ("allowVoteChanges" IN (0, 1)),
    "weight"            INTEGER NOT NULL DEFAULT 1,
    "public"            INTEGER NOT NULL DEFAULT 0 CHECK ("public" IN (0, 1)),
    PRIMARY KEY ("id" AUTOINCREMENT)
);

INSERT INTO custom_polls_temp (
    id, owner, name, prompt, answers, textRes, blind, allowVoteChanges, weight, public
)
SELECT
    id, owner, name, prompt, answers, textRes, blind, 1, weight, public
FROM custom_polls;

DROP TABLE custom_polls;
ALTER TABLE custom_polls_temp RENAME TO custom_polls;


-- 08: Digipog Pool Tables

-- This migration creates the digipog_pools and digipog_pool_users tables,
-- and modifies the transactions table to include a pool column.

CREATE TABLE IF NOT EXISTS "digipog_pools" 
(
    "id"          INTEGER NOT NULL UNIQUE,
    "name"        TEXT    NOT NULL,
    "description" TEXT    NOT NULL DEFAULT "None",
    "amount"      INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY ("id" AUTOINCREMENT)
);

CREATE TABLE IF NOT EXISTS "digipog_pool_users"
(
    "pool"        INTEGER NOT NULL,
    "userId"      INTEGER NOT NULL,
    "owner"       TEXT    NOT NULL DEFAULT "",
);

CREATE TABLE IF NOT EXISTS "transactions_temp"
(
    "from_user" INTEGER,
    "to_user"   INTEGER,
    "pool"      INTEGER,
    "amount"    INTEGER NOT NULL,
    "reason"    TEXT NOT NULL DEFAULT "None",
    "date"      TEXT NOT NULL
);

INSERT INTO transactions_temp (
    from_user, to_user, amount, reason, date
)
SELECT
    from_user, to_user, amount, reason, date
FROM transactions;

DROP TABLE transactions;
ALTER TABLE transactions_temp RENAME TO transactions;


-- 09: Class Permissions Table

-- This migration creates the class_permissions,
-- removes the permissions and plugins columns from the classroom table,
-- and migrates existing data to the new structure.

-- Create class_permissions table
CREATE TABLE IF NOT EXISTS "class_permissions" (
	"classId"	        INTEGER NOT NULL UNIQUE,
	"manageClass"	    INTEGER NOT NULL DEFAULT 4,
	"manageStudents"	INTEGER NOT NULL DEFAULT 4,
	"controlPoll"	    INTEGER NOT NULL DEFAULT 3,
	"votePoll"	        INTEGER NOT NULL DEFAULT 2,
	"seePoll"	        INTEGER NOT NULL DEFAULT 1,
	"breakHelp"	        INTEGER NOT NULL DEFAULT 3,
	"auxiliary"	        INTEGER NOT NULL DEFAULT 3,
	"links"	            INTEGER NOT NULL DEFAULT 3,
	"userDefaults"	    INTEGER NOT NULL DEFAULT 1
);

-- Remove permissions and plugins columns from classroom table
CREATE TABLE IF NOT EXISTS "classroom_temp" (
	"id"	        INTEGER NOT NULL UNIQUE,
	"name"	        TEXT NOT NULL,
	"owner"	        INTEGER NOT NULL,
	"key"	        INTEGER NOT NULL,
	"tags"	        TEXT,
	"settings"	    TEXT,
	PRIMARY KEY("id" AUTOINCREMENT)
);

INSERT INTO classroom_temp (
    id, name, owner, key, tags, settings
)
SELECT
    id, name, owner, key, tags, settings
FROM classroom;

DROP TABLE classroom;
ALTER TABLE classroom_temp RENAME TO classroom;

-- Migrate existing permissions data to class_permissions table
INSERT INTO class_permissions (classId)
SELECT id FROM classroom
WHERE id NOT IN (SELECT classId FROM class_permissions);

-- 10: Remove Old Tables

-- Removes obsolete tables: apps, lessons, plugins, stats

DROP TABLE IF EXISTS apps;
DROP TABLE IF EXISTS lessons;
DROP TABLE IF EXISTS plugins;
DROP TABLE IF EXISTS stats;


-- 11: Remove ClassUser Digipogs

-- Removes the unused digipogs column from the classusers table

CREATE TABLE IF NOT EXISTS "classusers_temp"
(
    "classId"     INTEGER NOT NULL,
    "studentId"   INTEGER NOT NULL,
    "permissions" INTEGER NOT NULL
);

INSERT INTO classusers_temp (
    classId, studentId, permissions
)
SELECT
    classId,
    studentId,
    permissions
FROM classusers;

DROP TABLE classusers;
ALTER TABLE classusers_temp RENAME TO classusers;