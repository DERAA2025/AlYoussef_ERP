-- ============================================================
-- Migration 3 — Locked retention/guarantee calculation base
-- Adds retention_base_value to assignments. Nullable, so this is a
-- safe additive change; the app falls back to the live assignment
-- value whenever it's not set, so nothing changes for existing data
-- until the one-time migration (ensureAssignmentRetentionBase, run
-- from the frontend) fills it in.
-- ============================================================

ALTER TABLE assignments ADD COLUMN retention_base_value REAL;
