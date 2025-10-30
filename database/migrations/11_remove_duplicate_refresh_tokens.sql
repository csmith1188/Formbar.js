-- 11_remove_duplicate_refresh_tokens.sql
-- This migration removes all duplicate refresh tokens from the refresh_tokens table.
-- It also enforces a UNIQUE constraint on the token column to prevent future duplicates.

-- Remove duplicates from the refresh tokens
DELETE FROM refresh_tokens
WHERE rowid NOT IN (
    SELECT MIN(rowid)
    FROM refresh_tokens
    GROUP BY refresh_token
);

-- Add a UNIQUE constraint to the refresh_token column
CREATE UNIQUE INDEX idx_refresh_token_unique ON refresh_tokens (refresh_token);