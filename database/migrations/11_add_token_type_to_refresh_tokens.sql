-- 11_add_token_type_to_refresh_tokens.sql
-- This migration adds a token_type column to distinguish between OAuth and normal auth tokens.
-- Existing tokens are set to 'oauth' as they were all created by the OAuth system.

-- Add the token_type column with default 'auth' for new tokens
ALTER TABLE refresh_tokens ADD COLUMN token_type TEXT NOT NULL DEFAULT 'auth';

-- Update all existing tokens to 'oauth' type (preserving existing OAuth tokens)
UPDATE refresh_tokens SET token_type = 'oauth';

-- Create an index on token_type and user_id for efficient queries
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_type ON refresh_tokens (token_type);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_type ON refresh_tokens (user_id, token_type);
