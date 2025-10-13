CREATE TABLE IF NOT EXISTS "links"
(
    "id"          INTEGER NOT NULL UNIQUE,
    "name"        TEXT    NOT NULL,
    "url"         TEXT    NOT NULL,
    "classId"     INTEGER NOT NULL,
    PRIMARY KEY ("id" AUTOINCREMENT)
);