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
    id, password, permissions, API, secret, tags, displayName, email, digipogs, verified
FROM users;

DROP TABLE users;
ALTER TABLE users_temp RENAME TO users;