CREATE TABLE IF NOT EXISTS agent_request_metrics (
    id BIGSERIAL,
    org_id UUID NOT NULL,
    agent_uuid UUID NOT NULL,
    timestamp_ms BIGINT NOT NULL,
    session_id TEXT NOT NULL DEFAULT '',
    model_requested TEXT NOT NULL DEFAULT '',
    model_used TEXT NOT NULL DEFAULT '',
    prompt_tokens BIGINT,
    completion_tokens BIGINT,
    total_tokens BIGINT,
    total_latency_ms BIGINT NOT NULL DEFAULT 0,
    detection_latency_ms BIGINT NOT NULL DEFAULT 0,
    upstream_latency_ms BIGINT NOT NULL DEFAULT 0,

    was_blocked BOOLEAN NOT NULL DEFAULT false,
    was_redacted BOOLEAN NOT NULL DEFAULT false,
    upstream_status INTEGER NOT NULL DEFAULT 0,
    inserted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_metrics_org_ts ON agent_request_metrics (org_id, timestamp_ms DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_agent_ts ON agent_request_metrics (agent_uuid, timestamp_ms DESC);
