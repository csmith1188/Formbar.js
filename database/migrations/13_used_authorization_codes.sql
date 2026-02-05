-- 13_used_authorization_codes.sql
-- This migration creates a table to track used OAuth authorization codes.
-- Per RFC 6749 Section 10.5, authorization codes must be single-use.

-- This will fail if the migration has already been run (table already has this column)
ALTER TABLE used_authorization_codes ADD COLUMN code_hash TEXT;

-- If we get here, the table doesn't exist properly, so drop it if it exists and recreate
DROP TABLE IF EXISTS used_authorization_codes;

CREATE TABLE used_authorization_codes (
    code_hash TEXT NOT NULL UNIQUE,
    used_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
);

-- Index for cleanup of expired codes
CREATE INDEX IF NOT EXISTS idx_used_auth_codes_expires ON used_authorization_codes (expires_at);
