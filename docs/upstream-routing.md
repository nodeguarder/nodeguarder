# Upstream Routing

NodeGuarder supports routing each LLM request to a different upstream provider based on the **model name** in the request payload. This enables cost control, provider segregation, and central gateway integration.

## Architecture

```
IDE prompt (model: "gpt-4-turbo")
         │
         ▼
┌─────────────────────────────┐
│  NodeGuarder Agent          │
│  • Scan for secrets/PII     │
│  • Show HITL modal          │
│  • Match model to route     │
└─────────┬───────────────────┘
          │ first-match wins
          ▼
┌─────────────────────────────┐
│  Matched Upstream Route     │
│  (URL + API key resolved)   │
└─────────────────────────────┘
```

## Route Table

### Local config (`config.toml`)

Routes are evaluated in **array order** (first match wins). Each route has:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `match_pattern` | string | yes | Glob pattern matched against the `model` field |
| `url` | string | yes | Upstream endpoint URL |
| `api_key` | string | no | Literal key or `env:VARIABLE_NAME` |

### Enterprise portal (database)

Routes are stored in the `policy_upstream_routes` table with a `priority` column (`ASC` order). Portal-only fields:

| Field | Type | Description |
|-------|------|-------------|
| `api_key_source` | string | Env var name (e.g., `OPENAI_API_KEY`) — portal never sees the value |
| `priority` | int | Evaluation order, lower = higher priority |

### Glob Pattern Reference

| Pattern | Matches | Does Not Match |
|---------|---------|----------------|
| `*` | Everything | — |
| `gpt-4*` | `gpt-4`, `gpt-4-turbo`, `gpt-4-32k` | `gpt-3.5-turbo` |
| `gpt-4?-*` | `gpt-4-turbo`, `gpt-4-32k` | `gpt-4` |
| `claude-*-sonnet` | `claude-3-sonnet`, `claude-3-5-sonnet` | `claude-3-opus` |
| `*llama*` | `llama3`, `codellama`, `deepseek-llama` | `gpt-4` |


### Routing Semantics

1. The agent extracts the `model` field from the JSON payload.
2. Routes are evaluated in order until `glob_match(pattern, model)` returns `true`:
   - **Local config:** array order (first in file = first evaluated)
   - **Enterprise portal:** `priority ASC` order (sorted server-side before sending to agent)
3. The first matching route is used. If no route matches, the first route (`upstream_routes[0]`) is used as fallback.
4. A `*` catch-all route ensures every model has a fallback.

## Credential Resolution

### Literal Keys
The API key is stored in the policy database and transmitted to the agent in the `PolicyEnforcement` gRPC message. Suitable for shared keys (central gateway, service accounts).

### Env var reference (local config)
Use `env:VARIABLE_NAME` in the `api_key` field to read a key from the environment:

```toml
[[proxy.upstream_routes]]
match_pattern = "gpt-4*"
url = "https://api.openai.com/v1"
api_key = "env:OPENAI_API_KEY"
```

The agent reads `std::env::var("OPENAI_API_KEY")` at startup and caches the value.

### Env var reference (enterprise portal)
Use the `api_key_source` field. The portal never sees or stores the actual key value:

```toml
# Enterprise portal route config (not valid in local config.toml)
match_pattern = "gpt-4*"
url = "https://api.openai.com/v1"
api_key_source = "OPENAI_API_KEY"
```

- The resolved key is cached in the agent's local config until the next policy sync.
- If the env var is not set on the agent machine, the route is marked invalid and skipped.
- If both `api_key` and `api_key_source` are provided, `api_key_source` takes precedence.

## Backward Compatibility

The legacy `upstream_url` and `upstream_api_key` columns remain on the `policies` table:

- **Reading:** If `upstream_routes` is empty, a single `*` catch-all route is synthesized from the legacy fields.
- **Writing:** If `upstream_routes` is provided, it takes precedence. Legacy fields are mirrored from the first route for DB compatibility.
- **Migration `013_upstream_routes.sql`:** Seeds existing single-upstream policies as a `*` route.

## Agent Config

In local mode, routes are stored in `config.toml`:

```toml
[[proxy.upstream_routes]]
match_pattern = "gpt-4*"
url = "https://api.openai.com/v1"
api_key = "env:OPENAI_API_KEY"

[[proxy.upstream_routes]]
match_pattern = "*"
url = "http://localhost:11434/v1"
```

## Use Cases

### Single Upstream (Simple)
```
Pattern: *  →  https://api.openai.com/v1
```
Behaves identically to the legacy single-URL config. All models go to one provider.

### Multi-Provider
```
Pattern: gpt-4*       →  https://api.openai.com/v1       (env:OPENAI_API_KEY)
Pattern: gpt-3.5*     →  https://api.openai.com/v1       (env:OPENAI_API_KEY)
Pattern: claude-*     →  https://api.anthropic.com/v1    (env:ANTHROPIC_API_KEY)
Pattern: *llama*      →  http://localhost:11434/v1        (no auth)
Pattern: *            →  https://gateway.corp.internal   (literal key)
```
Cheap/experimental models route locally; production models go to paid providers; everything else hits the corporate gateway.

### All-Through-Central-Gateway (Enterprise)
```
Pattern: *  →  https://gateway.acme.com/v1  (env:NG_GATEWAY_KEY)
```
NodeGuarder handles desktop-level content inspection. The central gateway handles org-wide routing, rate limiting, audit, and cost tracking.

## Central Gateway Complement

NodeGuarder does **not** replace central LLM gateways (LiteLLM, Bifrost, custom). It complements them:

| Layer | Responsibility | Product |
|-------|---------------|---------|
| Desktop | Prompt inspection, secret redaction, policy enforcement | NodeGuarder Agent |
| Network | Traffic routing, rate limiting, cost tracking, key management | Central Gateway (LiteLLM, Bifrost, etc.) |
| Cloud | LLM inference | OpenAI, Azure, Anthropic, etc. |

Recommended enterprise deployment:

```
Developer IDE
     │  POST /v1/chat/completions
     ▼
NodeGuarder Agent
     │  scan + redact
     │  model → route matching
     ▼
Central Gateway (e.g., LiteLLM)
     │  rate limit + cost track
     ▼
LLM Provider (OpenAI / Azure / etc.)
```

The agent's route table has a single `*` catch-all pointing at the central gateway's URL. All key management, routing logic, and cost tracking live at the gateway layer. NodeGuarder focuses on what it does best: desktop-level content security.
