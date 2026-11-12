-- Add hashed pin column to digipog_pools

-- fails if digipog_pools has already been migrated
ALTER TABLE digipog_pools ADD COLUMN pin;