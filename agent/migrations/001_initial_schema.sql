-- NodeGuarder Enterprise Portal - Initial Schema

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(255) NOT NULL DEFAULT '',
    role VARCHAR(20) NOT NULL DEFAULT 'ADMIN' CHECK (role IN ('ADMIN', 'SECURITYOPS', 'AUDITOR')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_active_at TIMESTAMPTZ
);
CREATE INDEX idx_users_org_id ON users(org_id);

CREATE TABLE agents (
    uuid VARCHAR(36) PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    hostname VARCHAR(255) NOT NULL,
    ip_address VARCHAR(45),
    status VARCHAR(20) NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'revoked')),
    last_seen TIMESTAMPTZ,
    policy_version VARCHAR(255) DEFAULT '0',
    agent_version VARCHAR(20),
    identity_key_pem TEXT,
    cert_pem TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_agents_org_id ON agents(org_id);
CREATE INDEX idx_agents_status ON agents(status);
CREATE INDEX idx_agents_last_seen ON agents(last_seen);
CREATE INDEX idx_agents_hostname ON agents(hostname);

CREATE TABLE policies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT DEFAULT '',
    redaction_enforced BOOLEAN NOT NULL DEFAULT false,
    upstream_url TEXT,
    upstream_api_key TEXT,
    bind_port INTEGER,
    enable_ocr BOOLEAN,
    disable_atr_auto_update BOOLEAN,
    allow_custom_allowlists BOOLEAN NOT NULL DEFAULT true,
    bearer_token TEXT,
    detection_overrides JSONB DEFAULT '[]'::jsonb,
    custom_regex JSONB DEFAULT '[]'::jsonb,
    allowlists JSONB DEFAULT '[]'::jsonb,
    target_mode VARCHAR(20) NOT NULL DEFAULT 'all' CHECK (target_mode IN ('all', 'hostname_regex')),
    target_regex VARCHAR(255) DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID REFERENCES users(id)
);
CREATE INDEX idx_policies_org_id ON policies(org_id);

CREATE TABLE audit_logs (
    id UUID DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    agent_uuid VARCHAR(36) NOT NULL REFERENCES agents(uuid) ON DELETE CASCADE,
    user_name VARCHAR(255) DEFAULT '',
    content_type VARCHAR(50) NOT NULL,
    severity VARCHAR(10) NOT NULL DEFAULT 'MEDIUM',
    action_taken VARCHAR(20) NOT NULL,
    detection_method VARCHAR(50) DEFAULT '',
    preview VARCHAR(200) DEFAULT '',
    flagged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    session_id VARCHAR(100) DEFAULT '',
    timeout_triggered BOOLEAN NOT NULL DEFAULT false,
    policy_enforced BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY (id, flagged_at)
) PARTITION BY RANGE (flagged_at);
CREATE INDEX idx_audit_logs_org_agent ON audit_logs(org_id, agent_uuid);
CREATE INDEX idx_audit_logs_flagged_at ON audit_logs(flagged_at DESC);
CREATE INDEX idx_audit_logs_content_type ON audit_logs(content_type);
CREATE INDEX idx_audit_logs_action ON audit_logs(action_taken);

-- Create initial partitions
CREATE TABLE audit_logs_2026_q1 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-01-01') TO ('2026-04-01');
CREATE TABLE audit_logs_2026_q2 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-04-01') TO ('2026-07-01');
CREATE TABLE audit_logs_2026_q3 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-07-01') TO ('2026-10-01');
CREATE TABLE audit_logs_2026_q4 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-10-01') TO ('2027-01-01');

CREATE TABLE enrollment_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    code VARCHAR(20) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    used_by VARCHAR(36),
    used_at TIMESTAMPTZ
);
CREATE INDEX idx_codes_org_id ON enrollment_codes(org_id);
CREATE INDEX idx_codes_code ON enrollment_codes(code);

-- Seed default organization and admin user (password: NodeGuarder#DM1n)
-- IMPORTANT: Change this password after first login!
INSERT INTO organizations (id, name) VALUES (uuid_generate_v4(), 'Default Organization');

-- Password is bcrypt hash of 'NodeGuarder#DM1n'
INSERT INTO users (org_id, email, password_hash, display_name, role)
VALUES ((SELECT id FROM organizations WHERE name = 'Default Organization'), 'admin@nodeguarder.local',
        '$2b$12$5JciT5xMjB6hMjLbUi0btectaqd.OBWdTkmp7aZcS.xWBwTcNIdZC',
        'Admin', 'ADMIN');
