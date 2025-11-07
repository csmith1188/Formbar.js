-- 08_unique_display_name.sql
-- This migration creates a UNIQUE constraint on the display_name column in the users table

-- Add a UNIQUE constraint to the displayName column
CREATE UNIQUE INDEX idx_display_name_unique ON users (displayName);