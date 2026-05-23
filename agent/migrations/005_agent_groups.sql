CREATE TABLE agent_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_groups_org ON agent_groups(org_id);

CREATE TABLE agent_group_members (
    group_id UUID NOT NULL REFERENCES agent_groups(id) ON DELETE CASCADE,
    agent_uuid VARCHAR(36) NOT NULL REFERENCES agents(uuid) ON DELETE CASCADE,
    PRIMARY KEY (group_id, agent_uuid)
);
CREATE INDEX idx_group_members_agent ON agent_group_members(agent_uuid);
