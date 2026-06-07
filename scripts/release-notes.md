## v1.0.21

- **Fix:** Policy `bearer_token` and `upstream_api_key` now properly returned by GET/list endpoints (were missing from JSON response, causing frontend to show empty values)
- **Fix:** Saving a policy with empty `bearer_token` or `upstream_api_key` no longer overwrites the stored value (COALESCE → NULLIF to treat empty string as "don't change")
- **UI:** Usage page now shows total tokens instead of estimated cost, with 24h/7d/30d date range filtering on all metrics (summary, daily chart, per-model, per-agent)
- **Tech:** All 4 metrics API endpoints (`summary`, `daily`, `per-model`, `per-agent`) now accept optional `from`/`to` query parameters for flexible time range queries
- **Tech:** Removed `estimated_cost_usd` from backend and frontend types (no longer computed or displayed)
- **Tech:** Cleaned up unused parenthesis warnings in metrics handlers, suppressed dead_code warning on `estimate_cost()`

## v1.0.20

- **Fix:** Metrics API queries now cast `AVG()` results to double precision to fix 500 error on `/usage` page (PostgreSQL returns `NUMERIC` but Rust expects `FLOAT8`)
- **Fix:** Enterprise policy sync no longer clears `upstream_api_key` when the policy has an empty value — user-set API key is preserved
- **Fix:** Removed unused `post` import in policies handler to clean up build warning
- **UI:** Removed Organization ID display from agent Enterprise Management tab (redundant — enrolled/connected status is sufficient)

## v1.0.19

- **Fix:** Reverted `001_initial_schema.sql` to original content — modified migration files were causing `VersionMismatch` errors on upgrade; schema changes moved to new `010_add_bearer_token.sql` and `011_widen_policy_version.sql`
- **Fix:** Removed redundant "Activate" button in policy list (create/edit already updates `updated_at`; button did nothing)
- **Fix:** Enforced badge in policy list now checks all enforcement fields (upstream_url, bind_port, OCR, ATR, bearer_token, detection categories, custom_regex, allowlists, etc.) instead of only `redaction_enforced`
- **Fix:** Empty detection categories now correctly disable all toggles on the agent (previously treated as "skip update" — toggles stayed enabled)
- **Fix:** PolicyEditor no longer resets empty detection categories to all 10 defaults on reload
- **Fix:** Bearer token display in agent Connectivity tab is greyed out when enforced by policy
- **UI:** Removed enforcement badges list from agent Enterprise Management tab (redundant — info shown in Protection/Connectivity tabs)
- **UI:** Model hardware text in agent Advanced tab now shows dynamically ("CPU optimized" / "GPU optimized") based on actual runtime
- **UI:** Removed upstream provider dropdown from Dashboard and LLM Landscape pages (users configure in policy view)
- **UI:** LLM Landscape Suggestions tab now shows policy count ("1 policy set") instead of "Next: configure your upstream LLM"; removed duplicate "upstream_url needed" card

## v1.0.18

- **Security Fix:** Scan all user messages in conversation history (not just the last one) to prevent data leaks when clients re-send full cached history
- **Fix:** Download provisioning.toml now includes auth token (was returning 401)
- **Fix:** HITL timeout is now correctly recorded in audit logs (`timeout_triggered: true`)
- **Fix:** Agent's `policy_version` now stores the policy name instead of raw UUID (portal Agent Detail + agent UI show readable name)
- **Fix:** Widen `policy_version` column to VARCHAR(255) to fit policy names
- **Fix:** `agent_request_metrics.agent_uuid` now correctly parses UUID (was failing with type mismatch)
- **UI:** Enforcement badges in agent "Enterprise Management" tab now wrap properly with flex layout
- **UI:** Renamed labels for clarity — "AI Tools on This Machine" → "AI Tools detected on this machine", "Proxy Endpoint" → "NodeGuarder proxy endpoint", "Bearer Token" → "NodeGuarder bearer token" (agent UI + portal policy editor)

## v1.0.17

- **Feature:** Add policy-enforced bearer token support for agents (shared secret mode)
- **Feature:** Dynamic model name in onboarding config snippets (use the model name from the selected upstream, not hardcoded "gpt-4o")
- **Fix:** Auto-start respects previous user preference on setting open/update

## v1.0.16

- **Fix:** Streaming requests now check upstream HTTP status before wrapping as SSE — upstream errors propagate properly instead of silent "no response"
- **Fix:** Trusted Patterns row now greyed out (`opacity: 0.5`, `disabled`) when enrolled via Enterprise policy
- **Fix:** Policy version displays correctly from sync, persists to local `config.toml`
- **Feature:** Connectivity tab with provider dropdown (OpenAI/Ollama/GitHub Models/Custom), upstream reachability indicator, env var hints, and AI Tools config detection
- **Feature:** Environment scan on settings open — detects IDE configs (Continue, Cursor, VS Code) and env vars

## Installation

### Agent (Windows)
1. Download **NodeGuarder-Setup-{VERSION}.msi**
2. Run the installer
3. Point your AI apps to `http://127.0.0.1:51820/v1`

### Enterprise Portal (Linux / Windows / macOS)
1. Download **ng-portal-bundle-{VERSION}.zip**
2. Unzip the zip file
3. In the unzipped folder follow **INSTRUCTIONS.txt**
***

**Disclaimer:** This software is provided "AS IS" without warranty of any kind. See the [LICENSE](https://github.com/nodeguarder/nodeguarder/blob/main/LICENSE) file for details.**
