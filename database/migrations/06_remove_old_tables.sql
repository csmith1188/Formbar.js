-- 06_remove_old_tables.sql
-- This migration removes obsolete tables: apps, lessons, plugins, and stats.

DROP TABLE IF EXISTS apps;
DROP TABLE IF EXISTS lessons;
DROP TABLE IF EXISTS plugins;
DROP TABLE IF EXISTS stats;