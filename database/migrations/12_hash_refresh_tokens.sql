-- 12_hash_refresh_tokens.sql
-- This migration converts the refresh_tokens table to store hashed tokens instead of cleartext.
-- This prevents token replay attacks if the database is compromised.
-- Note: Existing tokens cannot be migrated and users will need to re-authenticate.

-- This will fail if the migration has already been run (column already exists)
ALTER TABLE refresh_tokens ADD COLUMN token_hash TEXT;

-- Create new table with proper constraints
CREATE TABLE refresh_tokens_new (
    user_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    exp INTEGER NOT NULL,
    token_type TEXT NOT NULL DEFAULT 'auth'
);

-- Drop old table and rename new one
DROP TABLE refresh_tokens;
ALTER TABLE refresh_tokens_new RENAME TO refresh_tokens;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_type ON refresh_tokens (token_type);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_type ON refresh_tokens (user_id, token_type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_refresh_token_hash_unique ON refresh_tokens (token_hash);
