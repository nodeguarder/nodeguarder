## v1.0.28

- **Fix:** CI — pin `windows-2022` runner image (avoids `windows-latest` June 2026 redirect to untested `windows-2025-vs2026`)
- **Fix:** CI — pin `Swatinem/rust-cache@v2.7.8` (resolves cache restore failure on new Windows runner images)
- **Removed:** Response cache system — only applied to non-streaming requests (0% hit rate in practice); removed `cache.rs`, `was_cached` field from metrics, gRPC, DB schema, frontend Usage page
- **Fix:** Agent detail page now shows usage metrics — was returning 0 rows due to UUID `String` bound to native `UUID` column; parsed with `Uuid::parse_str` before binding
- **Fix:** Dashboard action counts always 0 — `action_taken` values `'REDACTED'`/`'ALLOWED'`/`'BLOCKED'` (past tense) didn't match actual `'REDACT'`/`'ALLOW'`/`'BLOCK'` values; also included `AUTO_REDACT`/`AUTO_BLOCK`
- **Fix:** Dashboard total_agents included revoked agents — added `WHERE status != 'revoked'`
- **Fix:** Compliance reports excluded `AUTO_BLOCK`/`AUTO_REDACT` events — added to SQL `IN` clauses
- **Fix:** Compliance date boundary used `<` instead of `<=` — today's records were always excluded
- **Fix:** Compliance Risk Management showed "In Progress" with 0 detections — now "Not Started" (score 0.0)
- **Fix:** Compliance Human Oversight logic inverted — measured `allowed > 0` (penalized blocking); now measures any action taken
- **Fix:** Compliance Transparency penalized blocking — now includes all actions in ratio
- **Fix:** Compliance evidence text improved — more descriptive language (e.g., "3 threats blocked" instead of "3 blocked")
- **Fix:** Token estimate now uses message content length instead of full `body.len()` — strips JSON structural overhead for more accurate counts
- **UI:** Agent window resized 900×650 → 1100×700
- **UI:** Portal compliance page — added tooltip icons on all metrics and controls; added info banner explaining page purpose
- **UI:** Portal Get Started — replaced stale `docs/ide-setup-guide.md` link with "View LLM Landscape" button
- **UI:** Portal agent detail — removed Organization UUID field (useless noise); renamed "Revoke" to "Revoke & Delete" (also deletes agent_request_metrics before deleting agent row); improved empty usage message
- **UI:** Policy editor — upstream routes section expanded by default; OCR checkbox moved to Detection Categories with description; bind port input removed

## v1.0.27

- **Removed:** Response cache system — only applied to non-streaming requests (0% hit rate in practice); removed `cache.rs`, `was_cached` field from metrics, gRPC, DB schema, frontend Usage page
- **Fix:** Agent detail page now shows usage metrics — was returning 0 rows due to UUID `String` bound to native `UUID` column; parsed with `Uuid::parse_str` before binding
- **Fix:** Dashboard action counts always 0 — `action_taken` values `'REDACTED'`/`'ALLOWED'`/`'BLOCKED'` (past tense) didn't match actual `'REDACT'`/`'ALLOW'`/`'BLOCK'` values; also included `AUTO_REDACT`/`AUTO_BLOCK`
- **Fix:** Dashboard total_agents included revoked agents — added `WHERE status != 'revoked'`
- **Fix:** Compliance reports excluded `AUTO_BLOCK`/`AUTO_REDACT` events — added to SQL `IN` clauses
- **Fix:** Compliance date boundary used `<` instead of `<=` — today's records were always excluded
- **Fix:** Compliance Risk Management showed "In Progress" with 0 detections — now "Not Started" (score 0.0)
- **Fix:** Compliance Human Oversight logic inverted — measured `allowed > 0` (penalized blocking); now measures any action taken
- **Fix:** Compliance Transparency penalized blocking — now includes all actions in ratio
- **Fix:** Compliance evidence text improved — more descriptive language (e.g., "3 threats blocked" instead of "3 blocked")
- **Fix:** Token estimate now uses message content length instead of full `body.len()` — strips JSON structural overhead for more accurate counts
- **UI:** Agent window resized 900×650 → 1100×700
- **UI:** Portal compliance page — added tooltip icons on all metrics and controls; added info banner explaining page purpose
- **UI:** Portal Get Started — replaced stale `docs/ide-setup-guide.md` link with "View LLM Landscape" button
- **UI:** Portal agent detail — removed Organization UUID field (useless noise); renamed "Revoke" to "Revoke & Delete" (also deletes agent_request_metrics before deleting agent row); improved empty usage message
- **UI:** Policy editor — upstream routes section expanded by default; OCR checkbox moved to Detection Categories with description; bind port input removed

## v1.0.26

- **Fix:** Agent local audit history now preserved — replaced `clear_logs()` with tracked-sent-counter; `trim_logs(100)` keeps last 100 entries locally; only unsent entries pushed to portal
- **Fix:** UI freeze when toggling "Auto Start on Boot" — registry update moved to background thread
- **Fix:** Auto Start toggle now disabled when enrolled (consistent with other enforcement-disabled toggles)
- **Fix:** File upload handler now applies permissive→enforced_redact enrollment upgrade (matching chat handler behavior)
- **UI:** Agent "Gateway" tab renamed to "Routing"
- **UI:** Agent audit table now shows `Method` column (detection_method: REGEX/ATR/FP_OVERTURN/ONNX) and timeout indicator
- **UI:** Portal Action badges now properly color `AUTO_REDACT` (green) and `AUTO_BLOCK` (red) instead of default blue
- **UI:** Portal audit table now shows timeout indicator on Action
- **UI:** CSV export now includes Detection Method column
- **UI:** Upstream Routes lock icon overflow fixed (grid column `auto` → `0.5fr`, added `overflow-x: auto`)

## v1.0.25

- **Fix:** Audit log duplication bug — agent now `clear_logs()` after successful sync push (was no-op `trim_logs(100)` that never fired under 100 entries); push failures preserve logs for retry instead of crashing
- **Fix:** Portal dedup — new migration `015_audit_log_dedup.sql` removes existing duplicates + unique index; INSERT now uses `ON CONFLICT DO NOTHING`
- **Fix:** FP_Overturn audit trail — dead code revived; false-positive overturns now produce an audit entry with `action: ALLOW` and `detection_method: "FP_OVERTURN"` instead of being silently discarded
- **UI:** Onboarding completed screen shows "Configure Your AI APP/IDE" (was "Configure Your IDE"), adds enrollment code generation + "Create Policy" link
- **UI:** Dashboard adds "Enroll a New Agent" card with code generation
- **UI:** New portal logins redirect to `/dashboard` instead of re-showing the completed onboarding page

## v1.0.24

- **Feature:** Enterprise enrollment hides Allow button in HITL modal when admin policy enforces redaction, shows "Admin has enforced redaction" banner
- **Fix:** Audit log auto-action entries now labeled `AUTO_REDACT`/`AUTO_BLOCK` instead of generic `REDACT`/`BLOCK` for timeout and auto-mode decisions
- **UI:** PolicyEditor renames "Permissive" → "User Choice" for clarity
- **Tech:** Portal version number synced to `enterprise-portal/frontend/package.json`

## v1.0.23

- **Feature:** Replace per-policy `redaction_enforced` boolean with `on_detection` action mode selector (`permissive`, `enforced_redact`, `enforced_block`, `auto_redact`, `auto_block`)
- **Feature:** Detect aider and cline AI coding tools in environment landscape scan
- **Fix:** CI Docker build retry on transient failures (3 attempts with backoff)

## v1.0.22

- **Rename:** "Connectivity" → "Gateway" across agent UI nav, heading, description, and all doc files
- **Feature:** Policy version auto-increment (displayed as `v3` in portal cards, stored as `"PolicyName v3"` on agent)
- **Feature:** Policy priority field (default 100, lower = higher priority) for conflict resolution — agent picks highest-priority policy
- **Feature:** Per-field detection enforcement toggles (replaces blanket `config.enrolled`; each detection category independently controlled)
- **Feature:** Multi-upstream routing with model-pattern glob matching (e.g., `gpt-4*` → OpenAI, `*llama*` → Ollama)
- **Feature:** Env var key source (`env:OPENAI_API_KEY`) — API keys never transmitted from portal to agent
- **Feature:** Interactive route table editor in agent Gateway tab (local mode) and read-only locked view (enterprise mode)
- **UI:** Policy cards show version badge, priority badge, and route count
- **UI:** Policy editor adds version display, priority input, and upstream routes table with ENV toggle and warning alert
- **Tech:** Migration `012_policy_priority_version.sql` — adds `priority INT DEFAULT 100` + `version INT DEFAULT 1` to policies
- **Tech:** Migration `013_upstream_routes.sql` — new `policy_upstream_routes` table, seeds existing single-upstream policies as `*` catch-all routes
- **Tech:** Agent sidecar `glob_match()` + `find_matching_route()` for model-based routing at proxy layer
- **Tech:** Backward compatible — legacy `upstream_url`/`upstream_api_key` synthesized as `*` route when routes table empty
- **Docs:** New `docs/upstream-routing.md` — dedicated architecture reference with glob reference, credential resolution, central gateway pattern

## v1.0.21

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
