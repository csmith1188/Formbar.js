-- Add promptMD and promptHTML fields to each table
-- custom_polls
ALTER TABLE custom_polls ADD COLUMN promptMD    TEXT;
ALTER TABLE custom_polls ADD COLUMN promptHTML  TEXT;

UPDATE custom_polls
SET 
    promptMD = prompt,
    promptHTML = prompt
WHERE promptMD IS NULL OR promptHTML IS NULL;

-- poll_history
ALTER TABLE poll_history ADD COLUMN promptMD    TEXT;
ALTER TABLE poll_history ADD COLUMN promptHTML  TEXT;

UPDATE poll_history
SET 
    promptMD = prompt,
    promptHTML = prompt
WHERE promptMD IS NULL OR promptHTML IS NULL;