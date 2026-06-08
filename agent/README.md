# NodeGuarder Local Agent

A local security proxy that sits between your AI coding tools (IDE) and the LLM provider. It scans prompts for secrets, PII, and prompt injections before they leave your machine. Uses DeBERTa-v3 (184M params) for semantic verification with DirectML GPU acceleration.

## Architecture

```
Your IDE (Cursor / Continue.dev / Windsurf)
     │
     ▼  POST /v1/chat/completions (Bearer ng-xxx...)
┌─────────────────────────────────────────────┐
│  NodeGuarder Agent                          │
│  • Scans prompt for secrets/PII             │
│  • Shows HITL modal (Redact/Allow/Block)    │
│  • Routes by model name to matching upstream│
└──────────────┬──────────────────────────────┘
               │  cleaned request forwarded
               │  (model name → glob pattern match)
               ▼  POST /v1/chat/completions
┌─────────────────────────────────────┐
│  Upstream LLM (route-matched)       │
│  OpenAI / Azure / Ollama / Gateway  │
└─────────────────────────────────────┘
```

## Setup (3 Steps)

### 1. Start NodeGuarder
Run the agent. It starts a local proxy on `http://127.0.0.1:51820/v1` and generates a unique bearer token.

### 2. Configure Your IDE
Set your IDE's OpenAI-compatible endpoint to NodeGuarder:

| Setting | Value |
|---------|-------|
| OpenAI Base URL | `http://127.0.0.1:51820/v1` |
| API Key | Your NodeGuarder bearer token (copy from tray) |

Supports: Cursor, VS Code + Continue.dev, Windsurf, any IDE with custom OpenAI endpoint support.

See [IDE Setup Guide](../docs/ide-setup-guide.md) for detailed configuration examples for each IDE, including Continue.dev config.json snippets and enterprise deployment via Intune/MDM.

### 3. Configure Upstream Routing
In NodeGuarder Settings → Gateway, configure one or more upstream routes. Each route specifies a **model pattern** (glob), **URL**, and **API key/credential source**. The agent forwards each request to the first route whose pattern matches the model name in the request.

| Model Pattern | Upstream URL | Auth |
|--------------|-------------|------|
| `gpt-4*` | `https://api.openai.com/v1` | Password field |
| `gpt-3.5*` | `https://api.openai.com/v1` | Password field |
| `*` | `https://gateway.corp.internal/v1` | `env:OPENAI_API_KEY` |

- **`*` catch-all** — matches any model not matched by a more specific pattern
- **`env:VARIABLE_NAME`** — reads the API key from an environment variable on the agent machine (key never transmitted from the portal)
- **First-match wins** — routes are evaluated in priority order; the first matching route handles the request

## Detection

NodeGuarder uses 419 ATR community rules across 10 categories:
- API keys & secrets
- Database credentials
- PII (email, SSN, credit cards)
- Prompt injection & tool poisoning
- Shell & code execution
- Social engineering
- Malicious skills
- Excessive autonomy
- Model abuse
- Data poisoning

## Enterprise Portal

Supports enrollment with NodeGuarder Enterprise Portal for centralized policy management and audit logs. The portal runs as the same binary (`nodeguarder-agent.exe --portal`) with a React admin UI, REST API, and gRPC server.

See `nodeguarder_enterprise_portal.md` for architecture, setup, and policy model. See `nodeguarder_local_master.md` for the full local agent spec.
