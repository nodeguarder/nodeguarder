CREATE TABLE policy_assignments (
    policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
    group_id UUID NOT NULL REFERENCES agent_groups(id) ON DELETE CASCADE,
    PRIMARY KEY (policy_id, group_id)
);
