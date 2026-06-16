# NodeGuarder Agent

An AI security gateway that intercepts LLM API calls to detect and prevent sensitive data leakage. Runs as a local OpenAI-compatible proxy with regex + DeBERTa-v3 semantic analysis.

## Quick Start

1. Download the latest MSI from [Releases](https://github.com/nodeguarder/releases/releases)
2. Run the installer
3. Launch NodeGuarder Agent from the Start Menu
4. Point your AI apps to `http://127.0.0.1:51820/v1` with the bearer token shown in Settings

## System Requirements

- Windows 10/11 64-bit
- 8GB RAM (16GB recommended for semantic model)
- ~1.5GB free disk space (model downloads on first run)
- GPU with DirectML support optional (RTX 2070+ tested)

## Features

- **Regex Detection** — 419 ATR community rules across 10 categories (API keys, PII, injection, etc.)
- **Semantic Verification** — DeBERTa-v3 ONNX model (~704MB) confirms context before flagging
- **HITL Modal** — Human-in-the-loop prompt with Redact / Allow / Block (15s timeout → Redact)
- **File Scanning** — PDF text extraction, image OCR (Windows), text file scanning
- **System Tray** — Quick access to settings, API URL, bearer token, and audit logs
- **Enterprise Enrollment** — Optional gRPC connection to central management portal

## Build from Source

```powershell
# Build agent (desktop — default features include GUI, agent, semantic, enterprise)
cd agent
cargo build --release

# Build agent (headless server / enterprise portal only)
cd agent
cargo build --release --no-default-features --features "enterprise"

# Build MSI installer (requires WiX Toolset v3)
.\installer\build_msi.ps1 -SourceDir .\agent\target\release
```

## Enterprise Portal

The enterprise portal provides fleet-wide policy management, centralized audit, and compliance reporting.

Run the agent in portal mode:
```powershell
nodeguarder-agent.exe --portal
```

This starts a REST API on `127.0.0.1:3000` and a gRPC server on `127.0.0.1:50051`,
backed by PostgreSQL. Requires `enterprise` feature (included in default build).

### Docker Compose

See `enterprise-portal/` for the full Docker Compose deployment with PostgreSQL, PgBouncer, UI, and the portal API.

## License

Licensed under the MIT License. See `LICENSE` for details.
