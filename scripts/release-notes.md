## v1.0.26

- **Fix:** Agent local audit history now preserved — replaced `clear_logs()` with tracked-sent-counter; `trim_logs(100)` keeps last 100 entries locally; only unsent entries pushed to portal
- **Fix:** UI freeze when toggling "Auto Start on Boot" — registry update moved to background thread
- **Fix:** Auto Start toggle now disabled when enrolled (consistent with other enforcement-disabled toggles)
- **Fix:** File upload handler now applies permissive→enforced_redact enrollment upgrade (matching chat handler behavior)
- **UI:** Agent "Gateway" tab renamed to "Routing"
- **UI:** Agent audit table now shows `Method` column (detection_method: REGEX/ATR/FP_OVERTURN/ONNX) and timeout indicator ⏱
- **UI:** Portal Action badges now properly color `AUTO_REDACT` (green) and `AUTO_BLOCK` (red) instead of default blue
- **UI:** Portal audit table now shows timeout indicator ⏱ on Action
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
