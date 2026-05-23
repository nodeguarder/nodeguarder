-- NodeGuarder Enterprise Portal - Agent Environment Reports
-- Stores LLM environment discovery data pushed by agents

CREATE TABLE agent_environment_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    agent_uuid VARCHAR(36) NOT NULL REFERENCES agents(uuid) ON DELETE CASCADE,
    report JSONB NOT NULL DEFAULT '{}'::jsonb,
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_env_reports_org_agent ON agent_environment_reports(org_id, agent_uuid);
CREATE INDEX idx_env_reports_detected_at ON agent_environment_reports(detected_at DESC);
CREATE INDEX idx_env_reports_gin ON agent_environment_reports USING gin (report);
