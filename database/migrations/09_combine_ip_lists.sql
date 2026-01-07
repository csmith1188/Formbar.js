-- 09_combine_ip_lists.sql
-- Combine ip_whitelist and ip_blacklist into a single ip_access_list table

CREATE TABLE IF NOT EXISTS "ip_access_list"
(
    "id"           INTEGER NOT NULL UNIQUE,
    "ip"           TEXT    NOT NULL,
    "is_whitelist" INTEGER NOT NULL CHECK ("is_whitelist" IN (0, 1)),
    PRIMARY KEY ("id" AUTOINCREMENT)
);

-- Migrate data from ip_whitelist (is_whitelist = 1)
INSERT INTO ip_access_list (ip, is_whitelist)
SELECT ip, 1 FROM ip_whitelist;

-- Migrate data from ip_blacklist (is_whitelist = 0)
INSERT INTO ip_access_list (ip, is_whitelist)
SELECT ip, 0 FROM ip_blacklist;

-- Drop the old tables
DROP TABLE IF EXISTS ip_whitelist;
DROP TABLE IF EXISTS ip_blacklist;

