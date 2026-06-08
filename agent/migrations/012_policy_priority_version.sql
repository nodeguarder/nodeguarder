ALTER TABLE policies ADD COLUMN priority INT NOT NULL DEFAULT 100;
ALTER TABLE policies ADD COLUMN version INT NOT NULL DEFAULT 1;
CREATE INDEX idx_policies_priority ON policies(org_id, priority, updated_at DESC);
