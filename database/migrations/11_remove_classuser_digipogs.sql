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