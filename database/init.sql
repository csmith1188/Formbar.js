CREATE TABLE IF NOT EXISTS "apps"
(
    "id"    INTEGER NOT NULL UNIQUE,
    "owner" INTEGER NOT NULL,
    "name"  TEXT    NOT NULL,
    "key"   INTEGER NOT NULL,
    "full"  INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY ("id" AUTOINCREMENT)
);

CREATE TABLE IF NOT EXISTS "class_polls"
(
    "pollId"  INTEGER NOT NULL,
    "classId" INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS "classroom"
(
    "id"          INTEGER NOT NULL UNIQUE,
    "name"        TEXT    NOT NULL,
    "owner"       INTEGER NOT NULL,
    "key"         INTEGER NOT NULL,
    "permissions" TEXT    NOT NULL,
    "tags"        TEXT,
    "settings"    TEXT,
    PRIMARY KEY ("id" AUTOINCREMENT)
);

CREATE TABLE IF NOT EXISTS "classusers"
(
    "classId"     INTEGER NOT NULL,
    "studentId"   INTEGER NOT NULL,
    "permissions" INTEGER,
    "digiPogs"    INTEGER
);

CREATE TABLE IF NOT EXISTS "custom_polls"
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

INSERT INTO "custom_polls" ("id", "owner", "name", "prompt", "answers", "textRes", "blind", "allowVoteChanges", "weight", "public") VALUES (1, NULL, 'TUTD', 'Thumbs?', '[{"answer":"Up","weight":0.9,"color":"#00FF00"},{"answer":"Wiggle","weight":1,"color":"#00FFFF"},{"answer":"Down","weight":1.1,"color":"#FF0000"}]', 0, 0, 1, 1, 1);
INSERT INTO "custom_polls" ("id", "owner", "name", "prompt", "answers", "textRes", "blind", "allowVoteChanges", "weight", "public") VALUES (2, NULL, 'True/False', 'True or False', '[{"answer":"True","weight":1,"color":"#00FF00"},{"answer":"False","weight":1,"color":"#FF0000"}]', 0, 0, 1, 1, 1);
INSERT INTO "custom_polls" ("id", "owner", "name", "prompt", "answers", "textRes", "blind", "allowVoteChanges", "weight", "public") VALUES (3, NULL, 'Done/Ready?', 'Done/Ready?', '[{"answer":"Yes","weight":1,"color":"#00FF00"}]', 0, 0, 1, 1, 1);
INSERT INTO "custom_polls" ("id", "owner", "name", "prompt", "answers", "textRes", "blind", "allowVoteChanges", "weight", "public") VALUES (4, NULL, 'Multiple Choice', 'Multiple Choice', '[{"answer":"A","weight":1,"color":"#FF0000"},{"answer":"B","weight":1,"color":"#0000FF"},{"answer":"C","weight":1,"color":"#FFFF00"},{"answer":"D","weight":1,"color":"#00FF00"}]', 0, 0, 1, 1, 1);

CREATE TABLE IF NOT EXISTS "ip_blacklist"
(
    "id" INTEGER NOT NULL UNIQUE,
    "ip" TEXT    NOT NULL,
    PRIMARY KEY ("id" AUTOINCREMENT)
);

CREATE TABLE IF NOT EXISTS "ip_whitelist"
(
    "id" INTEGER NOT NULL UNIQUE,
    "ip" TEXT    NOT NULL,
    PRIMARY KEY ("id" AUTOINCREMENT)
);

CREATE TABLE IF NOT EXISTS "lessons"
(
    "class"   TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "date"    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS "plugins"
(
    "id"      INTEGER NOT NULL UNIQUE,
    "name"    TEXT    NOT NULL,
    "url"     TEXT    NOT NULL,
    "classId" INTEGER NOT NULL,
    PRIMARY KEY ("id" AUTOINCREMENT)
);

CREATE TABLE IF NOT EXISTS "poll_answers"
(
    "pollId"         INTEGER NOT NULL,
    "userId"         INTEGER NOT NULL,
    "buttonResponse" TEXT,
    "textResponse"   TEXT
);

CREATE TABLE IF NOT EXISTS "poll_history"
(
    "id"    INTEGER NOT NULL UNIQUE,
    "class" INTEGER NOT NULL,
    "data"  TEXT    NOT NULL,
    "date"  TEXT    NOT NULL,
    PRIMARY KEY ("id" AUTOINCREMENT)
);

CREATE TABLE IF NOT EXISTS "refresh_tokens"
(
    "user_id"       INTEGER NOT NULL,
    "refresh_token" TEXT    NOT NULL UNIQUE,
    "exp"           INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS "shared_polls"
(
    "pollId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS "temp_user_creation_data"
(
    "token"  TEXT NOT NULL UNIQUE,
    "secret" TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS "transactions"
(
    "from"     INTEGER NOT NULL,
    "to"       INTEGER NOT NULL,
    "digipogs" INTEGER NOT NULL,
    "app"      TEXT    NOT NULL DEFAULT 'None',
    "reason"   TEXT    NOT NULL DEFAULT 'None',
    "date"     TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS "users"
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