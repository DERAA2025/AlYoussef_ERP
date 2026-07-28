-- ============================================================
-- Migration 2 — WBS 3-level hierarchy
-- Adds level (1/2/3) and parent_code to the existing wbs_codes table.
-- Both are nullable so this is a safe, additive change for databases
-- that already went through migration 1. The old `cat` column is left
-- in place (unused going forward) rather than dropped, to avoid any
-- DROP COLUMN version-compatibility risk.
-- ============================================================

ALTER TABLE wbs_codes ADD COLUMN level INTEGER;
ALTER TABLE wbs_codes ADD COLUMN parent_code TEXT;
