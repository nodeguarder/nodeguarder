# IDE Setup Guide

Configure your IDE to route all LLM traffic through the NodeGuarder agent proxy
so every prompt is scanned for secrets, PII, and prompt injections.

## How It Works

```
Your IDE (Cursor / Continue / Windsurf / JetBrains)
     │
     ▼  POST /v1/chat/completions (Bearer ng-xxx...)
┌─────────────────────────────────────┐
│  NodeGuarder Agent (localhost:51820)│
│  • Scans prompt for secrets/PII     │
│  • Shows HITL verification modal    │
│  • Forwards cleaned request         │
└──────────┬──────────────────────────┘
           │  cleaned request forwarded
           ▼  POST /v1/chat/completions
┌─────────────────────────────────────┐
│  Upstream LLM                       │
│  (OpenAI / Ollama / Azure / etc.)   │
└─────────────────────────────────────┘
```

The agent listens on `http://localhost:51820/v1`. Set your IDE's OpenAI-compatible
endpoint to this address and use the agent's bearer token as the API key.

---

## Continue.dev

Edit `~/.continue/config.json` (macOS/Linux) or
`%USERPROFILE%\.continue\config.json` (Windows):

```json
{
  "models": [
    {
      "title": "NodeGuarder",
      "provider": "openai",
      "model": "gpt-4",
      "apiBase": "http://localhost:51820/v1",
      "apiKey": "ng-<your-token-here>"
    }
  ],
  "tabAutocompleteModel": {
    "title": "NodeGuarder Tab",
    "provider": "openai",
    "model": "gpt-4o-mini",
    "apiBase": "http://localhost:51820/v1",
    "apiKey": "ng-<your-token-here>"
  }
}
```

You can copy your bearer token from the agent tray icon → **Copy API URL**,
or run `nodeguarder-agent token` from the command line.

---

## Cursor

1. Open **Settings** (gear icon)
2. Go to the **Models** tab
3. Add a new model provider:
   - **OpenAI Base URL**: `http://localhost:51820/v1`
   - **API Key**: `ng-<your-token-here>`
   - **Default Model**: `gpt-4` (or your preferred model)

Cursor will now route all chat and inline-edits through the agent.

---

## VS Code (Continue Extension)

Same as Continue.dev above — the Continue extension reads
`~/.continue/config.json`. Follow the Continue.dev instructions.

---

## Windsurf

1. Open **Settings** (gear icon)
2. Search for "OpenAI"
3. Set **OpenAI Base URL** to `http://localhost:51820/v1`
4. Set **API Key** to `ng-<your-token-here>`

---

## JetBrains (AI Assistant)

1. Open **Settings → Tools → AI Assistant**
2. Select **OpenAI** as the provider
3. Set **API URL** to `http://localhost:51820/v1`
4. Set **API Key** to `ng-<your-token-here>`

---

## Any OpenAI-Compatible IDE

If your IDE allows a custom OpenAI endpoint, use:

| Setting | Value |
|---------|-------|
| OpenAI Base URL | `http://localhost:51820/v1` |
| API Key | Your agent bearer token (`ng-...`) |

---

## Upstream LLM Configuration

After the agent scans the prompt, it forwards the cleaned request to an
upstream LLM. Configure this in the agent **Settings → Connectivity**
or in `config.toml`:

```toml
[proxy]
upstream_url = "https://api.openai.com/v1"   # or Ollama, Azure, etc.
api_key = "sk-..."                            # your real upstream API key
bind_port = 51820
```

Common upstream values:

| Provider | URL |
|----------|-----|
| OpenAI | `https://api.openai.com/v1` |
| Ollama (local) | `http://localhost:11434/v1` |
| Azure OpenAI | `https://<resource>.openai.azure.com/` |
| Anthropic | `https://api.anthropic.com/v1` |
| Custom | Your own endpoint |

---

## Enterprise Deployment (MDM / Intune)

For fleet deployments, push the agent + IDE config via MDM tools like
Microsoft Intune, Jamf, or Group Policy.

### Silent Agent Install (Intune)

```powershell
msiexec /i NodeGuarder-1.0.0.msi /quiet /norestart
```

### Auto-Enrollment via Provisioning

Place a `provisioning.toml` at `%PROGRAMDATA%\NodeGuarder\provisioning.toml`
to auto-enroll the agent on first launch:

```toml
[provisioning]
enrollment_code = "ng-<enrollment-code>"
portal_url = "https://your-portal.example.com:9443"
```

### Push IDE Config (Intune)

Use a **Configuration Profile** or **PowerShell script** in Intune
to write the IDE config files:

**Continue.dev (PowerShell remediation script):**

```powershell
$continueDir = "$env:USERPROFILE\.continue"
$null = New-Item -ItemType Directory -Force -Path $continueDir

@"
{
  "models": [{
    "title": "NodeGuarder",
    "provider": "openai",
    "model": "gpt-4",
    "apiBase": "http://localhost:51820/v1",
    "apiKey": "ng-<deployment-token>"
  }]
}
"@ | Set-Content -Path "$continueDir\config.json" -Encoding UTF8
```

**Cursor (Intune via Preferences file):**

Push a `settings.json` with the preferred values using Group Policy or
a Proactive Remediation script targeting:
`%APPDATA%\Cursor\User\settings.json`

---

## Verification

### 1. Check the agent is running

```powershell
curl.exe -s http://localhost:51820/v1/health
# → {"status":"ok","version":"1.0.0"}
```

### 2. Send a test prompt

```powershell
curl.exe -s -X POST http://localhost:51820/v1/chat/completions `
  -H "Content-Type: application/json" `
  -H "Authorization: Bearer ng-<your-token>" `
  -d '{\"model\":\"gpt-4\",\"messages\":[{\"role\":\"user\",\"content\":\"Hello\"}]}'
```

### 3. In your IDE

Type a chat message. If the agent modal appears or the prompt is logged
in the portal's audit log, routing is working.
