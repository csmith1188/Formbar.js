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

CREATE TABLE IF NOT EXISTS "transactions_temp"
{
    "from_user" INTEGER NOT NULL,
    "to_user"   INTEGER NOT NULL,
    "amount"    INTEGER NOT NULL,
    "reason"    TEXT DEFAULT "None", 
    "date"      TEXT NOT NULL
}

INSERT INTO transactions_temp (from_user, to_user, amount, reason, date)
DROP TABLE transactions;
ALTER TABLE transactions_temp RENAME TO transactions;