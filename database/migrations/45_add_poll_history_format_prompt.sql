-- Add promptMD and promptHTML fields to each custom_polls

-- fails if custom_polls has already been migrated
-- will always run because migration 16 and/or 17 always modifies the poll_history table
ALTER TABLE poll_history ADD COLUMN promptMD    TEXT;
ALTER TABLE poll_history ADD COLUMN promptHTML  TEXT;