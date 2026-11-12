-- Bind pool PIN reset tokens to their target pool.
ALTER TABLE user_tokens ADD COLUMN pool_id INTEGER;
