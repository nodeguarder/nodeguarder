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
