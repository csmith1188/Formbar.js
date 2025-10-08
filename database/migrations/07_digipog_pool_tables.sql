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
    "id"       INTEGER NOT NULL UNIQUE,
    "owner"    TEXT    NOT NULL DEFAULT "",
    "member"   TEXT    NOT NULL DEFAULT ""
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