CREATE TABLE IF NOT EXISTS "classroom_temp"
(
    "id"          INTEGER NOT NULL UNIQUE,
    "name"        TEXT    NOT NULL,
    "owner"       INTEGER NOT NULL,
    "key"         INTEGER NOT NULL,
    "permissions" TEXT    NOT NULL,
    "tags"        TEXT,
    "settings"    TEXT,
    "plugins"    TEXT     DEFAULT  '{}',
    PRIMARY KEY ("id" AUTOINCREMENT)
);

ALTER TABLE classroom ADD COLUMN plugins DEFAULT '{}';

INSERT INTO classroom_temp (
    id, name, owner, key, permissions, tags, settings, plugins
)
SELECT
    id, name, owner, key, permissions, tags, settings, plugins
FROM classroom;

DROP TABLE classroom;
ALTER TABLE classroom_temp RENAME TO classroom;