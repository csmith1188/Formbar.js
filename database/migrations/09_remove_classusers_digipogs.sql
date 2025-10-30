CREATE TABLE IF NOT EXISTS temp_classusers (
    "classId"       INTEGER NOT NULL,
    "studentId"     INTEGER NOT NULL,
    "permissions"   INTEGER NOT NULL
);

INSERT INTO temp_classusers ("classId", "studentId", "permissions")
SELECT "classId", "studentId", "permissions" FROM classusers;
DROP TABLE classusers;
ALTER TABLE temp_classusers RENAME TO classusers;