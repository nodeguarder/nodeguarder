-- Migration: Add unique index on audit_logs to prevent duplicate entries
-- from repeated sync uploads.

-- Remove existing duplicate rows keeping the earliest (by id)
DELETE FROM audit_logs
WHERE (id, flagged_at) IN (
    SELECT id, flagged_at FROM (
        SELECT id, flagged_at,
               ROW_NUMBER() OVER (
                   PARTITION BY org_id, agent_uuid, content_type, action_taken, flagged_at, session_id, preview
                   ORDER BY id
               ) AS rn
        FROM audit_logs
    ) t
    WHERE rn > 1
);

-- Prevent future duplicates (includes partition key flagged_at)
CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_logs_unique
    ON audit_logs (org_id, agent_uuid, content_type, action_taken, flagged_at, session_id, preview);
