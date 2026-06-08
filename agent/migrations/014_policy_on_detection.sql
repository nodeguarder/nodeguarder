-- Migration: Add on_detection action mode to policies
-- Replaces redaction_enforced boolean with a string-based action selector
--
-- Values:
--   "permissive"      — show modal with Allow/Redact/Block (default)
--   "enforced_redact"  — show modal with Redact/Block only (equivalent to redaction_enforced=true)
--   "enforced_block"   — show modal with Block only
--   "auto_redact"      — skip modal, always redact
--   "auto_block"       — skip modal, always block

ALTER TABLE policies
  ADD COLUMN on_detection VARCHAR(32) NOT NULL DEFAULT 'permissive';

-- Seed existing policies: redaction_enforced=true → enforced_redact, false → permissive
UPDATE policies
  SET on_detection = CASE WHEN redaction_enforced THEN 'enforced_redact' ELSE 'permissive' END
  WHERE on_detection = 'permissive';
