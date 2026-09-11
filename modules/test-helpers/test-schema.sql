-- Test database schema - represents the fully-migrated current state of all tables.
-- Used exclusively by the test suite via an in-memory SQLite database.

-- Users table (final state: no permissions or role columns)
CREATE TABLE IF NOT EXISTS "users" (
    "id"          INTEGER NOT NULL UNIQUE,
    "email"       TEXT    NOT NULL UNIQUE,
    "password"    TEXT,
    "API"         TEXT    UNIQUE,
    "secret"      TEXT    NOT NULL UNIQUE,
    "tags"        TEXT,
    "digipogs"    INTEGER NOT NULL DEFAULT 0,
    "pin"         TEXT    DEFAULT NULL,
    "displayName" TEXT,
    "verified"    INTEGER NOT NULL DEFAULT 0,
    "pog_meter"   INTEGER NOT NULL DEFAULT 0 CHECK (pog_meter >= 0),
    PRIMARY KEY ("id" AUTOINCREMENT)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_display_name_unique ON users (displayName);

-- Refresh tokens (final state: uses token_hash, has token_type)
CREATE TABLE IF NOT EXISTS "refresh_tokens" (
    "user_id"       INTEGER NOT NULL,
    "token_hash"    TEXT    NOT NULL UNIQUE,
    "exp"           INTEGER NOT NULL,
    "token_type"    TEXT    NOT NULL DEFAULT 'auth'
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_type ON refresh_tokens (token_type);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_type ON refresh_tokens (user_id, token_type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_refresh_token_hash_unique ON refresh_tokens (token_hash);

-- Purpose-bound account tokens
CREATE TABLE IF NOT EXISTS "user_tokens" (
    "id"         INTEGER NOT NULL,
    "user_id"    INTEGER NOT NULL,
    "purpose"    TEXT    NOT NULL,
    "token_hash" TEXT    NOT NULL UNIQUE,
    "created_at" INTEGER NOT NULL,
    "expires_at" INTEGER NOT NULL,
    "used_at"    INTEGER,
    PRIMARY KEY ("id" AUTOINCREMENT)
);
CREATE INDEX IF NOT EXISTS idx_user_tokens_user_purpose ON user_tokens (user_id, purpose);
CREATE INDEX IF NOT EXISTS idx_user_tokens_purpose_hash ON user_tokens (purpose, token_hash);
CREATE INDEX IF NOT EXISTS idx_user_tokens_expires ON user_tokens (expires_at);

-- Classroom (final state: no permissions column, no settings column)
CREATE TABLE IF NOT EXISTS "classroom" (
    "id"       INTEGER NOT NULL UNIQUE,
    "name"     TEXT    NOT NULL,
    "owner"    INTEGER NOT NULL,
    "key"      INTEGER NOT NULL,
    "tags"     TEXT,
    PRIMARY KEY ("id" AUTOINCREMENT)
);
CREATE INDEX IF NOT EXISTS idx_classroom_owner ON classroom (owner);
CREATE INDEX IF NOT EXISTS idx_classroom_key ON classroom (key);

-- Class users(final state: no permissions or role columns)
CREATE TABLE IF NOT EXISTS "classusers" (
    "classId"     INTEGER NOT NULL,
    "studentId"   INTEGER NOT NULL,
    "digiPogs"    INTEGER
);
CREATE INDEX IF NOT EXISTS idx_classusers_class_student ON classusers (classId, studentId);
CREATE INDEX IF NOT EXISTS idx_classusers_student_class ON classusers (studentId, classId);

CREATE TABLE IF NOT EXISTS api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL, -- 'user' or 'app'
    entity_id INTEGER NOT NULL, -- user_id or app_id
    api_key_hash TEXT NOT NULL UNIQUE, -- SHA-256 hash of the API key
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_entity ON api_keys (entity_type, entity_id);

-- Named roles (final state: includes color column)
CREATE TABLE IF NOT EXISTS "roles" (
    "id"      INTEGER NOT NULL UNIQUE,
    "name"    TEXT    NOT NULL,
    "isDefault" INTEGER NOT NULL DEFAULT 0,
    "scopes"  TEXT    NOT NULL DEFAULT '[]',
    "color"   TEXT    NOT NULL DEFAULT '#808080',
    PRIMARY KEY ("id" AUTOINCREMENT)
);

CREATE TABLE IF NOT EXISTS "class_roles" (
    "roleId"  INTEGER NOT NULL,
    "classId" INTEGER NOT NULL,
    "orderIndex" INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_class_roles_unique" ON "class_roles" ("classId", "roleId");
CREATE INDEX IF NOT EXISTS "idx_class_roles_classId" ON "class_roles" ("classId");

-- User-to-role mapping
CREATE TABLE IF NOT EXISTS "user_roles" (
    "userId"  INTEGER NOT NULL,
    "roleId"  INTEGER NOT NULL,
    "classId" INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_user_roles_unique" ON "user_roles" ("userId", "roleId", COALESCE("classId", -1));
CREATE INDEX IF NOT EXISTS idx_user_roles_user_class ON user_roles (userId, classId);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_class ON user_roles (roleId, classId);

-- Seed built-in roles (with colors)
INSERT INTO "roles" ("name", "isDefault", "scopes", "color") VALUES ('Banned', 1, '["global.system.blocked","class.system.blocked"]', '#808080');
INSERT INTO "roles" ("name", "isDefault", "scopes", "color") VALUES ('Guest', 1, '["class.poll.read","class.links.read"]', '#95A5A6');
INSERT INTO "roles" ("name", "isDefault", "scopes", "color") VALUES ('Student', 1, '["global.pools.manage","global.digipogs.transfer","class.poll.read","class.poll.vote","class.break.request","class.timer.read","class.help.request","class.links.read"]', '#3498DB');
INSERT INTO "roles" ("name", "isDefault", "scopes", "color") VALUES ('Mod', 1, '["global.system.moderate","global.pools.manage","global.digipogs.transfer","class.poll.create","class.poll.end","class.poll.delete","class.poll.share","class.break.approve","class.help.approve","class.auxiliary.control","class.links.manage","class.poll.read","class.poll.vote","class.break.request","class.help.request","class.links.read"]', '#2ECC71');
INSERT INTO "roles" ("name", "isDefault", "scopes", "color") VALUES ('Teacher', 1, '["global.class.create","global.class.delete","global.digipogs.award","global.pools.manage","global.digipogs.transfer","class.students.read","class.students.kick","class.students.ban","class.session.start","class.session.end","class.session.rename","class.session.settings","class.session.regenerate_code","class.timer.control","class.digipogs.award","class.poll.create","class.poll.end","class.poll.delete","class.poll.share","class.break.approve","class.help.approve","class.auxiliary.control","class.links.manage","class.poll.read","class.poll.vote","class.break.request","class.help.request","class.links.read"]', '#F39C12');
INSERT INTO "roles" ("name", "isDefault", "scopes", "color") VALUES ('Manager', 1, '["global.system.admin","global.users.manage","global.class.create","global.class.delete","global.digipogs.award","global.pools.manage","global.digipogs.transfer","class.system.admin","class.students.read","class.students.kick","class.students.ban","class.session.start","class.session.end","class.session.rename","class.session.settings","class.session.regenerate_code","class.timer.control","class.digipogs.award","class.poll.create","class.poll.end","class.poll.delete","class.poll.share","class.break.approve","class.help.approve","class.auxiliary.control","class.links.manage","class.poll.read","class.poll.vote","class.break.request","class.help.request","class.links.read"]', '#E74C3C');

-- Custom polls (final state: includes allowVoteChanges and allowMultipleResponses)
CREATE TABLE IF NOT EXISTS "custom_polls" (
    "id"                     INTEGER NOT NULL UNIQUE,
    "owner"                  TEXT,
    "name"                   TEXT,
    "prompt"                 TEXT,
    "answers"                TEXT    NOT NULL,
    "textRes"                INTEGER NOT NULL DEFAULT 0 CHECK ("textRes" IN (0, 1)),
    "blind"                  INTEGER NOT NULL DEFAULT 0 CHECK ("blind" IN (0, 1)),
    "allowVoteChanges"       INTEGER NOT NULL DEFAULT 1 CHECK ("allowVoteChanges" IN (0, 1)),
    "allowMultipleResponses" INTEGER NOT NULL DEFAULT 0 CHECK ("allowMultipleResponses" IN (0, 1)),
    "weight"                 INTEGER NOT NULL DEFAULT 1,
    "public"                 INTEGER NOT NULL DEFAULT 0 CHECK ("public" IN (0, 1)),
    PRIMARY KEY ("id" AUTOINCREMENT)
);
CREATE INDEX IF NOT EXISTS idx_custom_polls_owner ON custom_polls (owner);

-- Default poll types
INSERT INTO "custom_polls" ("id","owner","name","prompt","answers","textRes","blind","allowVoteChanges","allowMultipleResponses","weight","public")
VALUES (1, NULL, 'TUTD', 'Thumbs?', '[{"answer":"Up","weight":0.9,"color":"#00FF00"},{"answer":"Wiggle","weight":1,"color":"#00FFFF"},{"answer":"Down","weight":1.1,"color":"#FF0000"}]', 0, 0, 1, 0, 1, 1);
INSERT INTO "custom_polls" ("id","owner","name","prompt","answers","textRes","blind","allowVoteChanges","allowMultipleResponses","weight","public")
VALUES (2, NULL, 'True/False', 'True or False', '[{"answer":"True","weight":1,"color":"#00FF00"},{"answer":"False","weight":1,"color":"#FF0000"}]', 0, 0, 1, 0, 1, 1);
INSERT INTO "custom_polls" ("id","owner","name","prompt","answers","textRes","blind","allowVoteChanges","allowMultipleResponses","weight","public")
VALUES (3, NULL, 'Done/Ready?', 'Done/Ready?', '[{"answer":"Yes","weight":1,"color":"#00FF00"}]', 0, 0, 1, 0, 1, 1);
INSERT INTO "custom_polls" ("id","owner","name","prompt","answers","textRes","blind","allowVoteChanges","allowMultipleResponses","weight","public")
VALUES (4, NULL, 'Multiple Choice', 'Multiple Choice', '[{"answer":"A","weight":1,"color":"#FF0000"},{"answer":"B","weight":1,"color":"#0000FF"},{"answer":"C","weight":1,"color":"#FFFF00"},{"answer":"D","weight":1,"color":"#00FF00"}]', 0, 0, 1, 0, 1, 1);

-- Poll answers
CREATE TABLE IF NOT EXISTS "poll_answers" (
    "pollId"         INTEGER NOT NULL,
    "classId"        INTEGER NOT NULL,
    "userId"         INTEGER NOT NULL,
    "responseIds"    TEXT,
    "buttonResponse" TEXT,
    "textResponse"   TEXT,
    "createdAt"      INTEGER,
    PRIMARY KEY ("userId", "pollId")
);

-- Poll history
CREATE TABLE IF NOT EXISTS "poll_history" (
    "id"                     INTEGER NOT NULL UNIQUE,
    "class"                  INTEGER NOT NULL,
    "prompt"                 TEXT,
    "responses"              TEXT,
    "allowMultipleResponses" INTEGER NOT NULL DEFAULT 0,
    "blind"                  INTEGER NOT NULL DEFAULT 0,
    "allowTextResponses"     INTEGER NOT NULL DEFAULT 0,
    "createdAt"              INTEGER NOT NULL,
    "auto_end_timer"         INTEGER,
    "auto_end_threshold"     INTEGER,
    "blind_until_ended"      INTEGER NOT NULL DEFAULT 0 CHECK ("blind_until_ended" IN (0, 1)),
    PRIMARY KEY ("id" AUTOINCREMENT)
);

-- Shared polls
CREATE TABLE IF NOT EXISTS "shared_polls" (
    "pollId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL
);

-- Class polls
CREATE TABLE IF NOT EXISTS "class_polls" (
    "pollId"  INTEGER NOT NULL,
    "classId" INTEGER NOT NULL
);

-- Temp user creation data
CREATE TABLE IF NOT EXISTS "temp_user_creation_data" (
    "token"  TEXT NOT NULL UNIQUE,
    "secret" TEXT UNIQUE
);

-- Used authorization codes (migration 13)
CREATE TABLE IF NOT EXISTS "used_authorization_codes" (
    "code_hash"  TEXT    NOT NULL UNIQUE,
    "used_at"    INTEGER NOT NULL,
    "expires_at" INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_used_auth_codes_expires ON used_authorization_codes (expires_at);

-- IP access list (migration 09)
CREATE TABLE IF NOT EXISTS "ip_access_list" (
    "id"           INTEGER NOT NULL UNIQUE,
    "ip"           TEXT    NOT NULL,
    "is_whitelist" INTEGER NOT NULL CHECK ("is_whitelist" IN (0, 1)),
    PRIMARY KEY ("id" AUTOINCREMENT)
);

-- Links (migration 02)
CREATE TABLE IF NOT EXISTS "links" (
    "id"      INTEGER NOT NULL UNIQUE,
    "name"    TEXT    NOT NULL,
    "url"     TEXT    NOT NULL,
    "classId" INTEGER NOT NULL,
    PRIMARY KEY ("id" AUTOINCREMENT)
);
CREATE INDEX IF NOT EXISTS idx_links_class_id ON links (classId);

-- Digipog pools (migration 03)
CREATE TABLE IF NOT EXISTS "digipog_pools" (
    "id"          INTEGER NOT NULL UNIQUE,
    "name"        TEXT    NOT NULL,
    "description" TEXT    NOT NULL DEFAULT 'None',
    "amount"      INTEGER NOT NULL DEFAULT 0,
	"share_item"  INTEGER DEFAULT NULL,
    PRIMARY KEY ("id" AUTOINCREMENT)
);

-- Digipog pool users (final state after migration 08_restructure_digipog_pool_users)
CREATE TABLE IF NOT EXISTS "digipog_pool_users" (
    "pool_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "owner"   INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY ("pool_id", "user_id")
);
CREATE INDEX IF NOT EXISTS idx_digipog_pool_users_user_pool ON digipog_pool_users (user_id, pool_id);
CREATE INDEX IF NOT EXISTS idx_digipog_pool_users_pool_owner ON digipog_pool_users (pool_id, owner);

-- Transactions (final state after migration 14_restructure_transactions)
CREATE TABLE IF NOT EXISTS "transactions" (
    "from_id"   INTEGER NOT NULL,
    "to_id"     INTEGER NOT NULL,
    "from_type" TEXT    NOT NULL,
    "to_type"   TEXT    NOT NULL,
    "amount"    INTEGER NOT NULL,
    "reason"    TEXT    NOT NULL DEFAULT 'None',
    "date"      TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_transactions_from_account_date ON transactions (from_type, from_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_to_account_date ON transactions (to_type, to_id, date DESC);

-- Notifications (migration 21)
CREATE TABLE IF NOT EXISTS "notifications" (
    "id"         INTEGER NOT NULL,
    "user_id"    INTEGER NOT NULL,
    "type"       TEXT    NOT NULL,
    "data"       TEXT,
    "is_read"    INTEGER NOT NULL DEFAULT 0 CHECK ("is_read" IN (0, 1)),
    "created_at" TEXT    NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY ("id" AUTOINCREMENT)
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications (user_id, is_read);

-- Inventory (migration 18)
CREATE TABLE IF NOT EXISTS "inventory" (
    "id"       INTEGER NOT NULL,
    "user_id"  INTEGER NOT NULL,
    "item_id"  INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1 CHECK ("quantity" > 0),
    PRIMARY KEY ("id" AUTOINCREMENT)
);

-- Item registry (migration 19)
CREATE TABLE IF NOT EXISTS "item_registry" (
    "id"          INTEGER NOT NULL,
    "name"        TEXT    NOT NULL,
    "description" TEXT,
    "stack_size"  INTEGER NOT NULL DEFAULT 1 CHECK ("stack_size" >= 0),
    "image_url"   TEXT,
    PRIMARY KEY ("id" AUTOINCREMENT)
);

-- Trades (final state after migration 38_update_trades_for_sources)
CREATE TABLE IF NOT EXISTS "trades" (
    "id"                 INTEGER NOT NULL,
    "from_user"          INTEGER NOT NULL,
    "to_user"            INTEGER NOT NULL,
    "from_source_type"   TEXT    NOT NULL DEFAULT 'inventory' CHECK (from_source_type IN ('inventory', 'pool')),
    "from_pool_id"       INTEGER,
    "to_source_type"     TEXT    NOT NULL DEFAULT 'inventory' CHECK (to_source_type IN ('inventory', 'pool')),
    "to_pool_id"         INTEGER,
    "offered_items"      TEXT,
    "requested_items"    TEXT,
    "offered_digipogs"   INTEGER,
    "requested_digipogs" INTEGER,
    "status"             TEXT    NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending', 'completed', 'rejected', 'canceled', 'failed')),
    "failure_reason"     TEXT,
    "created_at"         TEXT    NOT NULL,
    "updated_at"         TEXT    NOT NULL,
    PRIMARY KEY ("id" AUTOINCREMENT)
);
CREATE INDEX IF NOT EXISTS idx_trades_from_user ON trades (from_user);
CREATE INDEX IF NOT EXISTS idx_trades_to_user ON trades (to_user);
CREATE INDEX IF NOT EXISTS idx_trades_status ON trades (status);
CREATE INDEX IF NOT EXISTS idx_trades_from_user_status ON trades (from_user, status);
CREATE INDEX IF NOT EXISTS idx_trades_to_user_status ON trades (to_user, status);

-- Apps and registered OAuth redirect URIs
CREATE TABLE IF NOT EXISTS "apps" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "owner_user_id" INTEGER NOT NULL,
    "share_item_id" INTEGER NOT NULL,
    "pool_id" INTEGER NOT NULL,
    "client_secret_hash" TEXT
);

CREATE TABLE IF NOT EXISTS "app_redirect_uris" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "app_id" INTEGER NOT NULL,
    "redirect_uri" TEXT NOT NULL,
    UNIQUE ("app_id", "redirect_uri")
);
CREATE INDEX IF NOT EXISTS idx_app_redirect_uris_app ON app_redirect_uris (app_id);

CREATE TABLE IF NOT EXISTS oauth_grants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    app_id INTEGER NOT NULL,
    scopes TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    revoked_at INTEGER,
    UNIQUE (user_id, app_id)
);

CREATE INDEX IF NOT EXISTS idx_oauth_grants_user_app ON oauth_grants (user_id, app_id);
CREATE INDEX IF NOT EXISTS idx_oauth_grants_app ON oauth_grants (app_id);
