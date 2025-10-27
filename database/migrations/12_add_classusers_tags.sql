-- 12_add_classusers_tags.sql
-- This migration adds a tags column to the classusers table
-- to store student tags per class instead of system-wide

-- Create a new classusers table with the tags column
CREATE TABLE IF NOT EXISTS "classusers_temp"
(
    "classId"     INTEGER NOT NULL,
    "studentId"   INTEGER NOT NULL,
    "permissions" INTEGER NOT NULL,
    "tags"        TEXT
);

-- Copy existing data from classusers to the new table
INSERT INTO classusers_temp (
    classId, studentId, permissions, tags
)
SELECT
    classId,
    studentId,
    permissions,
    NULL
FROM classusers;

-- Migrate existing tags from users table to classusers table
-- For each user-class combination, copy their tags
UPDATE classusers_temp
SET tags = (
    SELECT users.tags
    FROM users
    WHERE users.id = classusers_temp.studentId
);

-- Drop the old classusers table and rename the new one
DROP TABLE classusers;
ALTER TABLE classusers_temp RENAME TO classusers;
