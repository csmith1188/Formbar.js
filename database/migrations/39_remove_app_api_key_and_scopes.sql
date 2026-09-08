-- 39_remove_app_api_key.sql
-- This migration removes the API key column from the apps table, as it's no longer needed.

-- Recreate apps table without api_key_hash, api_secret_hash, and scopes
CREATE TABLE apps_temp (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    owner_user_id INTEGER NOT NULL,
    share_item_id INTEGER NOT NULL,
    pool_id INTEGER NOT NULL,
	client_secret_hash TEXT
);

-- -- Copy data from apps table to apps_temp table
INSERT INTO apps_temp (id, name, description, owner_user_id, share_item_id, pool_id)
SELECT id, name, description, owner_user_id, share_item_id, pool_id FROM apps;

-- Drop apps table
DROP TABLE apps;

-- Rename apps_temp table to apps table
ALTER TABLE apps_temp RENAME TO apps;