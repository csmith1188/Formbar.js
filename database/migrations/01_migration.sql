CREATE TABLE IF NOT EXISTS refresh_tokens
(
    user_id       INTEGER,
    refresh_token TEXT    NOT NULL UNIQUE,
    exp           INTEGER NOT NULL
);


CREATE TABLE IF NOT EXISTS "users_temp"
(
    "id"          INTEGER NOT NULL UNIQUE,
    "username"    TEXT    NOT NULL,
    "email"       TEXT    NOT NULL UNIQUE,
    "password"    TEXT,
    "permissions" INTEGER,
    "API"         TEXT    NOT NULL UNIQUE,
    "secret"      TEXT    NOT NULL UNIQUE,
    "tags"        TEXT,
    "digipogs"    INTEGER NOT NULL DEFAULT 0,
    "displayName" TEXT,
    "verified"    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY ("id" AUTOINCREMENT)
);

INSERT INTO users_temp (
    id, username, password, permissions, API, secret, tags, displayName, email, digipogs, verified
)
SELECT
    id, username, password, permissions, API, secret, tags, displayName,
    '' AS email,         -- default placeholder for new column
    0 AS digipogs,       -- default value (as defined in schema)
    0 AS verified        -- default value (as defined in schema)
FROM users;

DROP TABLE users;
ALTER TABLE users_temp RENAME TO users;