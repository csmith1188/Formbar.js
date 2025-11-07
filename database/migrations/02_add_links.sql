-- 02_add_links.sql
-- Creates the links table to store links associated with classes.

CREATE TABLE IF NOT EXISTS "links"
(
    "id"          INTEGER NOT NULL UNIQUE,
    "name"        TEXT    NOT NULL,
    "url"         TEXT    NOT NULL,
    "classId"     INTEGER NOT NULL,
    PRIMARY KEY ("id" AUTOINCREMENT)
);