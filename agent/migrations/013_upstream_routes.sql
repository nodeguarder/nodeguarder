CREATE TABLE policy_upstream_routes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
    match_pattern TEXT NOT NULL DEFAULT '*',
    url TEXT NOT NULL,
    api_key TEXT,
    api_key_source TEXT,
    priority INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_upstream_routes_policy ON policy_upstream_routes(policy_id);

-- Seed existing single-upstream policies as catch-all routes
INSERT INTO policy_upstream_routes (policy_id, match_pattern, url, api_key, priority)
SELECT id, '*', upstream_url, upstream_api_key, 0
FROM policies
WHERE upstream_url IS NOT NULL;
