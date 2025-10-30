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