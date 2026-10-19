-- 41_update_trades_for_sources.sql
-- Rebuilds the trades table to support source-based trading (inventory items or pool digipogs).
-- Migrates old 'accepted' rows to 'completed'; preserves 'pending' and 'rejected' rows.

-- Guard: divides by zero if from_source_type already exists on trades, causing the
-- migration runner to skip this file on re-run. No extra table is created.
SELECT 1 / (1 - (SELECT COUNT(*) FROM pragma_table_info('trades') WHERE name = 'from_source_type'));

CREATE TABLE IF NOT EXISTS trades_v2 (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    from_user          INTEGER NOT NULL,
    to_user            INTEGER NOT NULL,
    from_source_type   TEXT    NOT NULL DEFAULT 'inventory' CHECK (from_source_type IN ('inventory', 'pool')),
    from_pool_id       INTEGER,
    to_source_type     TEXT    NOT NULL DEFAULT 'inventory' CHECK (to_source_type IN ('inventory', 'pool')),
    to_pool_id         INTEGER,
    offered_items      TEXT,
    requested_items    TEXT,
    offered_digipogs   INTEGER,
    requested_digipogs INTEGER,
    status             TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'rejected', 'canceled', 'failed')),
    failure_reason     TEXT,
    created_at         TEXT    NOT NULL,
    updated_at         TEXT    NOT NULL
);

INSERT INTO trades_v2 (id, from_user, to_user, from_source_type, to_source_type, offered_items, requested_items, status, created_at, updated_at)
SELECT
    id,
    from_user,
    to_user,
    'inventory',
    'inventory',
    offered_items,
    requested_items,
    CASE WHEN status = 'accepted' THEN 'completed' ELSE status END,
    created_at,
    updated_at
FROM trades;

DROP TABLE trades;
ALTER TABLE trades_v2 RENAME TO trades;

CREATE INDEX IF NOT EXISTS idx_trades_from_user ON trades (from_user);
CREATE INDEX IF NOT EXISTS idx_trades_to_user ON trades (to_user);
CREATE INDEX IF NOT EXISTS idx_trades_status ON trades (status);
CREATE INDEX IF NOT EXISTS idx_trades_from_user_status ON trades (from_user, status);
CREATE INDEX IF NOT EXISTS idx_trades_to_user_status ON trades (to_user, status);
