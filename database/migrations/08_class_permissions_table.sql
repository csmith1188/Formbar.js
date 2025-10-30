-- 09_class_permissions_table.sql
-- This migration creates the class_permissions,
-- removes the permissions and plugins columns from the classroom table,
-- and migrates existing data to the new structure.

-- Create class_permissions table
CREATE TABLE IF NOT EXISTS "class_permissions" (
	"classId"	        INTEGER NOT NULL UNIQUE,
	"manageClass"	    INTEGER NOT NULL DEFAULT 4,
	"manageStudents"	INTEGER NOT NULL DEFAULT 4,
	"controlPoll"	    INTEGER NOT NULL DEFAULT 3,
	"votePoll"	        INTEGER NOT NULL DEFAULT 2,
	"seePoll"	        INTEGER NOT NULL DEFAULT 1,
	"breakHelp"	        INTEGER NOT NULL DEFAULT 3,
	"auxiliary"	        INTEGER NOT NULL DEFAULT 3,
	"links"	            INTEGER NOT NULL DEFAULT 3,
	"userDefaults"	    INTEGER NOT NULL DEFAULT 1
);

-- Remove permissions and plugins columns from classroom table
CREATE TABLE IF NOT EXISTS "classroom_temp" (
	"id"	        INTEGER NOT NULL UNIQUE,
	"name"	        TEXT NOT NULL,
	"owner"	        INTEGER NOT NULL,
	"key"	        INTEGER NOT NULL,
	"tags"	        TEXT,
	"settings"	    TEXT,
	PRIMARY KEY("id" AUTOINCREMENT)
);

INSERT INTO classroom_temp (
    id, name, owner, key, tags, settings
)
SELECT
    id, name, owner, key, tags, settings
FROM classroom;

DROP TABLE classroom;
ALTER TABLE classroom_temp RENAME TO classroom;

-- Migrate existing permissions data to class_permissions table
INSERT INTO class_permissions (classId)
SELECT id FROM classroom
WHERE id NOT IN (SELECT classId FROM class_permissions);