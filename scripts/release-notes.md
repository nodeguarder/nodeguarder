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
