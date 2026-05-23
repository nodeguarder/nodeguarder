CREATE TABLE compliance_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    framework VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'not-started'
        CHECK (status IN ('compliant', 'in-progress', 'not-started')),
    score FLOAT NOT NULL DEFAULT 0.0,
    report_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    generated_by UUID REFERENCES users(id)
);
CREATE INDEX idx_compliance_org_framework ON compliance_reports(org_id, framework);
CREATE INDEX idx_compliance_generated_at ON compliance_reports(generated_at DESC);
