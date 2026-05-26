# NodeGuarder Local: Master Specification
**Version:** 28.0 (The "Local AI Gateway" Standard)
**Status:** MVP Ready / Finalized
**Architecture:** Local-First Rust Backend + Windows NPU/GPU Acceleration

---

## 1. Executive Summary
NodeGuarder Local is a developer-centric **Local AI Gateway** designed to provide a secure "Pre-Flight" bridge between local IDEs (Cursor, VS Code, Windsurf) and cloud-based LLMs. It operates as a local proxy that intercepts traffic, sanitizes sensitive data (PII/Secrets) using an on-device model, and enforces corporate security policies without introducing network latency.

---

## 2. Core Product Identity
- **Product Name:** NodeGuarder Local
- **Technical Category:** Local AI Gateway / Semantic Firewall
- **Target Audience:** Software Engineers and DevOps Professionals
- **Core Value Proposition:** "What you type stays local. What the cloud sees is safe."

---

## 3. Local Intelligence Engine (The "Sentry")
To ensure high-performance, private scrubbing, NodeGuarder utilizes a **hybrid detection strategy**:

- **Primary Model:** DeBERTa-v3 (184M parameters) fine-tuned for prompt injection and security classification (`protectai/deberta-v3-base-prompt-injection-v2`).
- **Detection Pipeline:** Fast regex/pattern matching (built-in + 419 ATR rules) → DeBERTa-v3 semantic confirmation → false-positive marker override system.
- **Rationale:** Regex catches 90% of secrets in <5ms; DeBERTa-v3 provides purpose-trained semantic verification for security threats (not SMS spam); FP marker system (Level 1 strong markers) overturns documentation/example content.
- **Runtime:** ONNX inference via `ort` crate (Microsoft ONNX Runtime, C++ DLL). DirectML GPU execution provider enabled by default with automatic CPU fallback.
- **Hardware:** DirectML GPU (NVIDIA RTX 2070 tested) or CPU fallback. ~704MB disk for model, ~1.2GB RAM during inference.
- **Latency Target:** <5ms regex-only; semantic inference <10ms GPU / 50-200ms CPU.
- **Known Limitation:** The DeBERTa-v3 model (704MB) is significantly larger than the old BERT-tiny (17MB). First-time download is one-time only; cached locally thereafter.
- **ATR Community Rules:** 419 detection rules across 10 categories, auto-updated weekly from NPM registry (`agent-threat-rules` package). Auto-update can be disabled in Settings → Advanced tab.

---

## 4. Feature Set: "Warn & Decide" Workflow
NodeGuarder Local implements a **Human-in-the-Loop (HITL)** security model:

1. **Detection:** Regex engine (built-in + 419 ATR rules across 10 categories) identifies API keys, database credentials, PII, prompt injections, code execution, and supply-chain attacks.
2. **Intervention:** Native Windows notification/modal appears with flagged content preview.
3. **User Action:**
   - **Redact:** Replace secrets with `[REDACTED_SECRET]` and continue.
   - **Allow:** Send original content (User takes responsibility; logged to audit trail).
   - **Block:** Terminate the request immediately.
4. **Streaming Handling:** Analysis occurs on **chunk boundaries** (1KB chunks) to avoid buffering entire prompts. Flagged chunks pause the stream until user responds.
5. **Timeout Logic:** If no user input within 15 seconds, system defaults to **Redact**. Timeout timer resets per chunk to prevent IDE hangs.
6. **False Positive Handling:** Two-layer system: (a) **Automatic FP markers** — common documentation/example keywords ("example", "tutorial", "placeholder", "QA") always override detection regardless of model confidence; category-specific weak markers ("code review", "customer support") gate on confidence. (b) **User allowlists** — custom regex patterns persisted locally.

---

## 5. Deployment & Technical Architecture
### A. The Smart-Port Relay
- **Default Port:** `51820` (OpenAI-compatible endpoint, high/obscure port chosen to avoid conflicts).
- **Auto-Discovery:** If `51820` is occupied, the agent cycles through `51821`–`51840` until an open port is found. 
- **Authentication:** Bearer token (user-generated on first launch, stored in `%APPDATA%\NodeGuarder\config`).
- **User Interface:** System Tray icon allows users to "Copy API URL" for easy pasting into IDE settings.

### B. Core Multi-Modal Support (MVP)
- **Text & Code:** Real-time chunk-based stream interception.
- **Attachments:** Pre-upload scan for logs, JSON, CSV, and PDF files (regex + OCR for images).
- **Images:** Out of scope for MVP. Vision capabilities deferred to v2.0.

### C. Agent ↔ Enterprise Portal Communication
- **Architecture:** The portal is the **same binary** as the agent (`nodeguarder-agent.exe --portal`). No separate backend service — one binary, two modes.
- **Protocol:** gRPC over TLS 1.3 (mTLS for agent auth).
- **Agent Registration:** On enrollment, agent sends UUID + hostname + identity key + enrollment code to portal. Portal validates the one-time code, stores agent metadata, returns an mTLS certificate.
- **Log Push:** Agent batches flagged prompts/redactions and pushes to portal every 5 minutes via `PushLogs` RPC.
- **Policy Sync:** Agent pulls policy from portal via `GetPolicy` RPC (every 5 minutes when enrolled). Portal returns a `PolicyEnforcement` message with 15 override fields. Agents validate policy signature via portal's cert.
- **Failure Mode:** If agent can't reach portal for >24h, agent reverts to **local-only mode** (no policy updates, logs stored locally, user warned via tray icon).
- **Endpoints (Portal):** REST API on port `3000` (for admin UI), gRPC on port `50051` (for agents). Both served from the same binary.

### D. Agent Enrollment & Multi-Instance Management
- **Discovery Problem:** Enterprise buys Admin Platform; 30 agents already installed by developers. How do they connect?
- **Enrollment Flow:**
   1. Admin generates a **one-time enrollment code** in portal (Settings → Enrollment Codes, 24-hour TTL).
   2. Admin shares code + portal gRPC URL with team (via email, Slack, Wiki).
   3. Developer/DevOps opens agent Settings → Connectivity tab, enters Admin Portal gRPC URL and enrollment code.
   4. Agent connects to portal's gRPC endpoint, calls `RegisterAgent` RPC with UUID + hostname + identity key + enrollment code.
   5. Portal validates code, inserts agent record, returns mTLS certificate + org_id.
   6. Agent transitions from **local-only mode** to **enrolled mode** (icon turns blue, logs pushed, policies pulled).
- **Post-Enrollment:**
  - Portal displays agent in dashboard (hostname, IP, last-seen, status).
  - Admin creates/deploys policies targeting "All Agents" or by hostname regex.
  - Agents pull policy every 5 minutes via `GetPolicy` RPC; push logs via `PushLogs` RPC.
- **Bulk Enrollment:** Admin can generate multiple enrollment codes; each code is one-time-use. Bulk code generation post-MVP.
- **Mock Enrollment:** For development/testing, code `ENV-MOCK-TEST` bypasses gRPC and simulates enrollment with all detection flags enforced.

### E. Agent Revocation & Unenrollment
- **Admin-Initiated Revocation:** Admin can revoke agents from Portal dashboard (e.g., if agent is compromised, employee leaves, or needs reset).
  - **Revocation Flow:**
    1. Admin clicks "Revoke" on agent in Agents page.
    2. Portal sets agent status to `revoked` in database.
    3. On next heartbeat, agent receives `agent_revoked: true` in `HeartbeatResponse`.
    4. Agent reverts to **local-only mode** (no logs pushed, policies cleared), shows toast notification.
    5. Agent requires new enrollment code to re-enroll.
  - **Revoked Agent Data:** Previous audit logs remain in Portal (immutable for compliance). Revoked agent UUID is blacklisted.
- **User-Initiated Unenrollment:** User clicks "Disconnect Agent" in Settings → Enterprise Management tab.
  - All enforcement flags reset, agent reverts to local-only mode.
  - Same outcome as revocation, but user-driven.
- **Security:** Revocation prevents re-enrollment with same code. Attacker cannot replay old enrollment codes.

---

## 6. Enterprise & Governance Tier
While the Local Agent is free/individual-focused, the Enterprise tier adds:
- **Centralized Enforcement:** Admins can lock agents into "Enforced Redaction" (No "Allow" button for users). Policy enforced via signed config pushed from Admin Platform.
- **Custom Rules:** Define regex patterns, allowlists, and blocklists via Admin Portal UI; pushed to agents via policy sync (Section 5C).
- **Audit Logs:** AES-256 encrypted logs stored in Admin Platform's Postgres database. Searchable dashboard with filters (user, agent, timestamp, secret type). Satisfies EU AI Act audit trail requirements.
- **Hardened Air-Gap:** Agents configured to block all outbound except to Admin Platform IP (via Windows Firewall rules). Prevents accidental data exfil.

---

## 7. Compliance & Regulatory Alignment (2026)
- **EU AI Act:** Serves as the technical implementation of "Risk Management" and "Data Governance" requirements.
- **Data Sovereignty:** All scrubbing decisions are made on-device; no sensitive data is sent to a third-party security cloud for analysis. Logs encrypted in transit; Admin Platform is self-hosted.
- **Threat Model:** 
  - **Compromised Local Machine:** Attacker gains access to `%APPDATA%\NodeGuarder\config` (Bearer token). Mitigation: Token is stored as salted PBKDF2 hash (not plaintext); Admin Platform validates token origin via mTLS cert.
  - **Reverse-Engineering Agent Binary:** Source code is public (open-source), so attacker learns detection logic anyway. Regex patterns embedded in binary; BERT-tiny model is publicly available on HuggingFace. No additional risk.
  - **Intercepting Agent ↔ Admin Communication:** mTLS prevents MITM; logs are encrypted end-to-end. Attacker cannot read flagged secrets.
  - **Admin Platform Breach:** All customer audit logs are encrypted at-rest (AES-256). Attacker cannot read historical flagged data without decryption key (stored separately in HSM for enterprise deployments).

---

## 8. Model Distribution & Regex Maintenance

### A. DeBERTa-v3 ONNX Distribution
- **Current Model:** `protectai/deberta-v3-base-prompt-injection-v2` (184M parameters) exported to ONNX via HuggingFace (`llmware/protectai-prompt-injection-onnx`). Stored in `model_cache/` relative to agent binary.
- **Runtime:** Microsoft ONNX Runtime via `ort` crate (C++ DLL, `load-dynamic` mode). Session is cached once loaded; inference reuses the same session.
- **GPU Acceleration:** DirectML execution provider enabled by default. Falls back to CPU if GPU unavailable. Tested on NVIDIA RTX 2070.
- **License Compliance:** Model is Apache 2.0 licensed.
- **Download Size:** ~704MB on disk (one-time download on first launch with `--features semantic`).

### B. ATR (Agent Threat Rules) Community Rules
- **Source:** ATR community repository (`agent-threat-rules` NPM package). Downloaded as YAML tarball from `registry.npmjs.org`.
- **Rules Count:** 419 rules across 7 ATR categories (injection, code_execution, social_engineering, skill_compromise, excessive_autonomy, model_abuse, data_poisoning). Plus 3 built-in categories (api_keys, db_credentials, pii).
- **Update Cadence:** Weekly auto-check (7-day cooldown). User-configurable toggle in Settings → Advanced tab to disable auto-updates.
- **Fallback:** Embedded `atr_rules.json` compiled into the binary for offline/fallback use.
- **Update Mechanism:** `check_for_atr_updates()` runs on startup in background thread. Downloads tarball, extracts YAML rules, converts to JSON, writes to `%APPDATA%\NodeGuarder\atr\atr_rules.json`.

### C. Core Regex Patterns
- **Core Patterns:** Shipped with agent binary (hardcoded). Updated via agent version releases.
- **Custom Patterns:** Admin Platform allows orgs to define custom regex rules (e.g., internal credential formats). Pushed to agents via policy sync (Section 5C).
- **Pattern Updates (Post-MVP):** Introduce a **Pattern Registry Service** (lightweight API) that agents poll quarterly for new patterns (AWS secret formats, etc.). Patterns signed by NodeGuarder's release cert.
- **Example Patterns (MVP):**
  - AWS: `AKIA[0-9A-Z]{16}`
  - GitHub Token: `ghp_[A-Za-z0-9_]{36}`
  - DB Connection Strings: `(mongodb|mysql|postgres)://[^@]+@[^/]+`
  - PII: Email regex, US SSN regex, credit card patterns (Luhn check).

---

## 9. Performance & Testing (MVP Validation)
- **Latency Benchmarks:** Regex-only: <5ms. DeBERTa-v3 semantic check: <10ms GPU (DirectML) / 50-200ms CPU. Session cached warm.
- **Accuracy Goals:** >95% F1 score for common secret patterns (AWS keys, DB passwords, API tokens). ATR injection/abuse rules at ~85-95% with DeBERTa verification (up from 70-80% with old BERT-tiny).
- **Stream Handling:** 1KB chunk processing; per-chunk timeout; no unbuffered data loss.
- **False Positive Rate:** <5% target on real codebase samples. Verified with test suite covering all 10 detection categories (see FP marker system §4.6).
- **Resource Profile:** CPU-only: ~200MB RAM idle, ~1.2GB during inference. GPU: ~800MB VRAM (RTX 2070), <100ms initialization.

---

## 9b. IDE Integration & Protocol Details

### A. OpenAI-Compatible Proxy
- **Supported IDEs:** Cursor, VS Code (with OpenAI extension), Windsurf, any IDE supporting OpenAI API.
- **API Contract:** Agent proxies `POST /v1/chat/completions` and `POST /v1/chat/completions` (streaming). Request/response structure identical to OpenAI API.
- **Bearer Token Format:** User copies token from System Tray → IDE settings (e.g., Cursor: `API Key = user-token-from-nodeguarder`). Token validated on every request.
- **Streaming Timeout Handling:** If a chunk takes >15s to analyze, agent auto-redacts and streams response to IDE. IDE sees no delay; user is notified locally of redaction via tray tooltip.
- **Disconnection Handling:** If IDE disconnects mid-stream (user cancels), agent gracefully closes TCP connection and logs event (free agents: local log; enterprise: pushed to admin).

### B. Configuration Bridge (Setup)
- **Cursor:** Agent provides copy-paste instructions: "Set API Endpoint to `http://localhost:51820/v1` and API Key to `[token]`."
- **VS Code:** Agent generates `.vscode/settings.json` snippet (users paste into project settings or global settings).
- **Windsurf:** Similar to Cursor; agent provides inline setup wizard.

---

## 10. MVP Development Roadmap
1. ✅ **Milestone 1:** Rust-based Axum proxy with "Smart Port" binding + Bearer token auth + mTLS groundwork.
2. ✅ **Milestone 2:** Regex-based detection engine + 419 ATR rules across 10 categories + DeBERTa-v3 ONNX integration for semantic verification + FP marker system.
3. ✅ **Milestone 3:** Native Windows Tray UI with HITL chunk-based notification system + degraded mode handling.
4. ✅ **Milestone 4:** Audit logging (AES-256 encrypted) and allowlist/blocklist rule engine. gRPC stub for Admin Platform integration (no backend yet).
5. ✅ **Milestone 5:** "Copy-Paste" configuration bridge for Cursor, VS Code, and Windsurf + E2E testing on real IDEs.
6. ✅ **Milestone 6:** GPU acceleration (DirectML), multi-model ensemble architecture, OCR-based image scanning in prompts, ATR auto-update UI toggle, flow diagram in settings.
7. ✅ **Milestone 7 (Enterprise Portal):** Full portal backend merged into agent binary (Axum + gRPC + Postgres). Single `nodeguarder-agent.exe --portal` serves REST API (`:3000`), gRPC (`:50051`), and React admin UI. Features: JWT auth, agent enrollment via enrollment codes, policy management with 15 enforcement fields, partitioned audit logs, mTLS cert generation, health endpoints. Docker Compose with Postgres + PgBouncer + Portal + UI.
8. **Post-MVP (v2.0):** License system, bulk enrollment, LDAP/Okta sync, compliance reports, SSO.

---

## 10. Licensing & Monetization Model

### A. Open-Source Agent (Free)
- **What:** NodeGuarder Local Agent (Rust proxy, detection engine, Windows Tray UI).
- **License:** MIT or Apache 2.0.
- **Distribution:** GitHub releases, standalone `.exe` installer.
- **Users:** Individual developers, self-hosted community.
- **Value:** Zero cost entry; full privacy; no cloud dependencies.

### B. Commercial Admin Platform (Paid)
- **What:** NodeGuarder Enterprise Portal — runs from the same `nodeguarder-agent.exe` binary with `--portal` flag (no separate backend). Includes Axum REST API, Tonic gRPC server, and React admin UI.
- **Features:**
  - Centralized agent fleet management (unlimited agent count; scales to 1000+ agents).
  - **Agent Enrollment:** One-time enrollment codes via gRPC `RegisterAgent` RPC; bulk enrollment support (post-MVP).
  - Unified audit log aggregation and search (from all deployed agents). AES-256 encrypted at-rest.
  - Policy enforcement (15 override fields: redaction, upstream URL, API key, OCR, ATR auto-update, custom allowlists, detection categories, custom regex, allowlists).
  - Compliance reporting (EU AI Act, SOC 2, audit trails with timestamps and user attribution).
  - Team/org management with role-based access control (RBAC): Admin, SecurityOps, Auditor.
  - Dashboard: Agent health, policy compliance, top flagged redactions, alerts.
- **Deployment:** Self-hosted Docker Compose (includes postgres:5433 + pgbouncer:6432 + portal:3000/50051 + UI:5173).
- **Pricing Model:** **Flat annual license per organization** (no per-agent metering). Single SKU: "NodeGuarder Enterprise Portal License."
  - Removes per-agent licensing complexity.
  - Customers can enroll unlimited agents without paying per-agent fees.
  - Licensing validated via **static license key file** (generated at purchase, embedded in Admin Platform Docker config).
- **License Key Mechanism:**
  - License key is a JWT token (RS256 signed by NodeGuarder). Contains: org_name, license_id, expiration_date, features (e.g., "sso, api_access").
  - Admin Platform validates key on startup; if expired or invalid, Portal UI displays banner: "License expired. Contact sales to renew."
  - Enrolled agents continue operating in enrolled mode (no interruption); only Portal admin access is restricted.
  - **No cloud validation:** Key is self-contained and cryptographically signed. No phoning home to nodeguarder.com. (Respects "no cloud" positioning.)
- **License:** Proprietary / Closed-source.

### C. Customer Journey (Updated)
1. **Developer Phase:** Downloads free Agent from GitHub, installs locally, uses immediately (30+ developers each install their own).
2. **Org Growth:** Security team realizes need for centralized control; purchases Enterprise Portal license (flat annual fee).
3. **License Delivery:** After purchase, customer receives license key + Docker Compose deployment guide.
4. **Deployment:** Admin deploys via `docker-compose up -d` in `enterprise-portal/` directory. Postgres starts on port 5433, portal on port 3000 (REST) + 50051 (gRPC).
5. **Onboarding Existing Agents:** 
   - Admin logs into Portal (`http://localhost:5173`), generates enrollment code in Settings → Enrollment Codes.
   - Shares gRPC URL (e.g., `https://portal.acme.com:50051`) and code with developers.
   - Developers enter URL + code in agent Settings → Connectivity tab → agents auto-enroll via gRPC.
   - Within 5 minutes, all agents appear in Portal dashboard (agent pulls policy on next heartbeat).
6. **Policy Enforcement:** Admin defines org-wide policies with 15 enforcement fields. Agents pick up policies automatically on next heartbeat (5-minute interval).
7. **Audit & Compliance:** Admin views/search/export audit logs from Portal. Logs include content type, severity, action taken, detection method.

### D. Trial License & Expiration Behavior
- **Trial Period:** 30-day trial license issued post "Book a Demo" call (unlimited agents, full features).
- **Trial Expiration - Admin Portal Access:**
  - Day 30: Portal UI displays persistent banner: "Trial license expires in 3 days. Contact sales to purchase."
  - Day 31+: Portal becomes **read-only mode**. Admin can view audit logs, dashboards, compliance reports, but cannot:
    - Edit policies.
    - Manage agents (revoke, enroll).
    - Create custom rules or allowlists.
    - Export reports (view-only).
  - **Purchase Conversion:** Admin provides valid license key → Portal fully unlocked immediately. No agent interruption.
- **Trial Expiration - Agent Behavior:**
  - Enrolled agents **continue operating normally** (no interruption). Logs still pushed, policies still applied.
  - Admin simply loses ability to manage/modify policies. Agents retain last-known policy until new license activates.
  - This preserves security posture even if org delays purchase.

---

## 10b. Admin Platform Operations & Infrastructure

### A. System Requirements (Supports 1000+ Agents)
- **CPU:** 8 vCPU (or 4-core with hyperthreading).
- **RAM:** 32GB (16GB Postgres buffer pool, 16GB API server for concurrent connections).
- **Disk:** 500GB SSD for Postgres (assuming ~1MB per agent per day in logs; scales to 1000 agents × 365 days ≈ 365GB).
- **Network:** 10Mbps minimum (agents push logs every 5 minutes; ~1KB per flag = negligible bandwidth).
- **Database:** PostgreSQL 14+. Connection pooling (PgBouncer) recommended for 1000+ agents.

### B. Audit Log Storage & Retention
- **Log Volume:** Each flagged prompt = ~1KB JSON record (timestamp, user, agent UUID, flagged content hash, action taken).
- **Retention Policy:** Default 90 days (configurable). Older logs auto-archived to cold storage or deleted per compliance requirements.
- **Encryption at Rest:** AES-256. Master key stored separately (HSM for enterprise deployments; file-based key for self-hosted standard tier).
- **GDPR Compliance:** Users can request log deletion for their agent; Portal provides "right to be forgotten" UI (post-MVP).
- **Redacted Content:** When redaction occurs, actual secret is NOT logged. Instead, log contains: `flagged_content_type="AWS_KEY", redaction_performed=true, user_action="REDACT"`. This prevents accidental secret storage in audit logs.
- **Log Format (JSON, Professional):**
  ```json
  {
    "timestamp": "2024-01-15T14:23:45.123Z",
    "agent_uuid": "a1b2c3d4-e5f6-47g8-h9i0-j1k2l3m4n5o6",
    "agent_hostname": "dev-laptop-001",
    "user": "alice.johnson",
    "ide": "cursor",
    "content_type": "AWS_API_KEY",
    "severity": "CRITICAL",
    "detection_method": "REGEX_SEMANTIC",
    "action_taken": "AUTO_REDACTED",
    "timeout_triggered": false,
    "redaction_applied": true,
    "policy_enforced": true,
    "flagged_content_hash": "sha256:a1b2c3d4...",
    "preview": "AKIA2B3C4D5E6F...",
    "session_id": "sess_xyz123abc"
  }
  ```
- **No Emoji in Logs:** All status/action fields use structured enumeration (REDACTED, ALLOWED, BLOCKED, AUTO_REDACTED, POLICY_ENFORCED, etc.). No emoji status indicators (❌, ✓, ⚠, etc.) in log records.
- **Local Agent Logs (Plaintext Fallback):**
  - Stored in `%APPDATA%\NodeGuarder\logs\agent.log` (plaintext, tab-delimited for readability).
  - Format: `[TIMESTAMP] [LEVEL] [COMPONENT] MESSAGE`
  - Example: `[2024-01-15T14:23:45Z] [INFO] [DETECTION] Flagged AWS_API_KEY via REGEX_SEMANTIC redaction applied session_id=sess_xyz123abc`
  - No emoji in plaintext logs either.

### C. Backup & Disaster Recovery
- **Backup Strategy:** Postgres backups (nightly) to S3 or local NAS (customer's choice). Retention: 30 days rolling.
- **RTO/RPO:** Recovery Time Objective = 4 hours (manual restore from backup). Recovery Point Objective = 24 hours (nightly backup).
- **High Availability (Post-MVP):** Postgres replication + failover for critical deployments (requires multi-node Postgres cluster).

---

## 10d. Enterprise Portal Architecture (Implemented)

### A. Technology Stack
- **Binary:** Single `nodeguarder-agent.exe` with modes: Agent (default) or Portal (`--portal` flag).
- **API Server:** Axum (Rust, same framework as the agent proxy — no separate backend).
- **Database:** PostgreSQL 15+ with PgBouncer (connection pooling for 1000+ agents).
- **Frontend:** React 18 (TypeScript, Vite bundler, Tailwind CSS).
- **gRPC + TLS 1.3:** Tonic framework, mTLS for agent authentication.
- **Auth:** JWT tokens (jsonwebtoken crate) for admin users; mTLS certs for agents.

### B. Portal Mode Components
All served from one binary with `--portal` flag:

| Component | Technology | Port |
|---|---|---|
| REST API | Axum (Rust) | 3000 |
| gRPC Server | Tonic (Rust) | 50051 |
| Database | PostgreSQL (via sqlx) | 5433 (host) |
| Frontend | React 18 + Vite + Nginx | 5173 |

**REST Endpoints:** `/api/v1/auth/*`, `/api/v1/agents/*`, `/api/v1/policies/*`, `/api/v1/audit-logs/*`, `/api/v1/dashboard/*`, `/api/v1/enrollment-codes/*`, `/api/v1/users/*`, `/api/v1/health`

**gRPC Service:** `AgentController` with RPCs: `RegisterAgent`, `PushLogs`, `GetPolicy`, `Heartbeat`

**Authentication:**
- Portal: JWT token (Authorization header, 24h expiry, validated via `FromRequestParts` extractor).
- Agents: mTLS certificate (signed by portal's CA on enrollment; implemented but optional in dev).

### C. Database Schema
Full schema at `agent/migrations/001_initial_schema.sql`. Key tables:
- **organizations** — Multi-tenant orgs (seeded with "Default Organization")
- **users** — Admin, SecurityOps, Auditor roles (seeded: `admin@nodeguarder.local` / `NodeGuarder#DM1n`)
- **agents** — Fleet (uuid, hostname, ip, status, last_seen, cert_pem, identity_key_pem)
- **policies** — 15 enforcement fields + target_mode (all/hostname_regex) + JSON arrays for detection_overrides, custom_regex, allowlists
- **audit_logs** — Partitioned by month (Q1 2026 – Q4 2032 via auto-partitions), 11 columns
- **enrollment_codes** — One-time use, TTL-limited, tracks used_by agent UUID

### D. Docker Compose Structure
```yaml
services:
  postgres:     # postgres:15-alpine, port 5433
  pgbouncer:    # edoburu/pgbouncer, port 6432
  api:          # build: ../agent, Dockerfile: Dockerfile.portal, ports 3000+50051
  ui:           # build: ./frontend, port 5173
```

### E. Security Boundaries
- **Portal (REST + gRPC):** Internal only. Accessed via internal network or VPN.
- **gRPC Endpoint:** Agents connect from anywhere (mTLS authentication).
- **Database:** Private to Docker network. No external port exposure.
- **Default Credentials:** Change admin password in production.

### F. Performance Characteristics
- **Agent Enrollment:** <500ms (cert generation + DB insert).
- **Policy Response:** <100ms (simple SQL query, no push needed — agents pull).
- **Audit Log Query:** <1s (indexed on org_id + agent_uuid + flagged_at).
- **Dashboard Load:** <2s (aggregate queries on agents + policies + logs).

### G. Deployment Flow (Customer)
1. Run `docker-compose up -d` in `enterprise-portal/`.
2. Admin visits `http://localhost:5173`, logs in with default credentials.
3. Generates enrollment codes in Settings → Enrollment Codes.
4. Shares gRPC URL + code with developers.
5. Agents connect to portal gRPC at `admin-server:50051`, enroll automatically.
6. Admin creates policies, agents pick them up on next heartbeat (5 min).

---

## 10e. Agent Communication Protocol (gRPC)

### A. gRPC Service Definition (Current)
Proto definition: `agent/proto/agent.proto`

```protobuf
service AgentController {
  rpc RegisterAgent(RegisterRequest) returns (RegisterResponse);
  rpc PushLogs(LogBatch) returns (LogAckResponse);
  rpc GetPolicy(PolicyRequest) returns (PolicyResponse);
  rpc Heartbeat(HeartbeatRequest) returns (HeartbeatResponse);
}

message RegisterRequest {
  string agent_uuid = 1;
  string hostname = 2;
  string ip_address = 3;
  bytes public_key = 4;
  string enrollment_code = 5;
  string agent_version = 6;
}

message RegisterResponse {
  bytes certificate = 1;
  string admin_grpc_endpoint = 2;
  string org_id = 3;
}

message PolicyEnforcement {
  bool redaction_enforced = 1;
  bool upstream_url_enforced = 2;    string upstream_url = 3;
  bool upstream_api_key_enforced = 4; string upstream_api_key = 5;
  bool bind_port_enforced = 6;       int32 bind_port = 7;
  bool ocr_enforced = 8;             bool enable_ocr = 9;
  bool atr_auto_update_enforced = 10; bool disable_atr_auto_update = 11;
  bool allow_custom_allowlists = 12;
  repeated string enabled_detection_categories = 13;
  repeated string custom_regex = 14;
  repeated string allowlists = 15;
}

message PolicyResponse {
  string policy_version = 1;
  PolicyEnforcement enforcement = 2;
  bytes signature = 3;
}

message HeartbeatRequest {
  string agent_uuid = 1;
  string hostname = 2;
  string ip_address = 3;
  int64 timestamp_ms = 4;
}

message HeartbeatResponse {
  bool policy_updated = 1;
  string latest_policy_version = 2;
  bool agent_revoked = 3;
}
```

### B. Message Flow
```
Agent                           Portal (gRPC :50051)
  |                                 |
  +-- RegisterAgent() ------------> |  (enrollment code + identity key)
  |                                 |
  | <---- RegisterResponse ------+  |  (mTLS cert + org_id)
  |                                 |
  +-- Heartbeat() (every 5min) ---> |  (keepalive + status)
  |                                 |
  | <---- HeartbeatResponse ------+  |  (revoked? policy updated?)
  |                                 |
  +-- PushLogs() (every 5min) ----> |  (batched audit logs)
  |                                 |
  | <---- LogAckResponse --------+  |
  |                                 |
  +-- GetPolicy() (every 5min) ---> |  (pull latest enforcement)
  |                                 |
  | <---- PolicyResponse ---------+  |  (PolicyEnforcement with 15 fields)
  |
```

---

## 10f. Failure & Recovery

### A. Agent Disconnection
- If agent can't reach admin for >24h: Agent reverts to local-only mode (no policy updates, logs buffered locally).
- When reconnected: Agent sends buffered logs (replay), fetches latest policy.

### B. Database Connection Failure
- Admin API returns 503 Service Unavailable.
- Admin Platform doesn't crash; Postgres auto-recovery (via Docker restart-policy).
- PgBouncer maintains stale connections for <30s (graceful degradation).

### C. Policy Signature Validation Fails
- Agent logs warning, continues with last-known-good policy.
- Admin notified via dashboard: "Policy validation failed on agent XYZ. Check network."

---

## 11. Distribution & Code Signing

### A. GitHub Actions CI/CD Pipeline & Code Signing

#### A1. Build & Release Workflow (`.github/workflows/release.yml`)
- **Trigger:** On git tag push (e.g., `git tag v1.0.0 && git push origin v1.0.0`).
- **Runner:** Windows (windows-latest, x86-64).
- **Steps:**
  1. **Checkout Code:** Git clone from main branch.
  2. **Setup Rust:** Use `actions-rs/toolchain@v1` (stable, MSVC).
  3. **Build Artifacts:**
     - Compile Rust binary: `cargo build --release`.
     - Generate MSI installer (WiX Toolset or NSIS script).
     - Generate SHA-256 checksums: `certutil -hashfile NodeGuarder.exe SHA256`.
  4. **Code Signing Strategy:**
     - **Phase 1 (MVP - Internal Beta):** Self-signed certificate (free, testing only).
       - Generate cert in CI: `New-SelfSignedCertificate -Subject "CN=NodeGuarder"`
       - Sign `.exe`: `SignTool sign /f selfsigned.pfx /p password /t http://timestamp.verisign.com /v NodeGuarder.exe`
       - Users see "Unknown Publisher" warning on first run. Intended for internal testing only.
       - **Do NOT distribute to public during this phase.**
     - **Phase 2 (Public Launch - Pre-Release):** Upgrade to **EV Code Signing Certificate** (Sectigo/DigiCert, ~$300-350/year).
       - Purchase EV cert (1-week identity verification).
       - Store cert as GitHub Secret: `SIGNING_CERT_BASE64` (base64-encoded .pfx).
       - Update workflow: `SignTool sign /f cert.pfx /p ${{ secrets.CERT_PASSWORD }} /t http://timestamp.digicert.com /v NodeGuarder.exe`
       - Result: No "Unknown Publisher" warning. Enterprise IT approves installer immediately. SmartScreen reputation builds over time.
       - **Re-release v1.0.0 with proper signature before public announcement.**
  5. **Create GitHub Release:**
     - Upload `.exe` to GitHub Releases.
     - Include checksums in release notes (SHA-256).
     - Draft release notes (auto-generated from git log, manual edits).
  6. **Notify via Webhook:**
     - Post to Discord/Slack: "NodeGuarder v1.0.0 released! Download: [link]"

#### A2. Test Workflow (`.github/workflows/test.yml`)
- **Trigger:** On every push to main + pull requests.
- **Runner:** Windows (windows-latest).
- **Steps:**
  1. **Unit Tests:** `cargo test --lib`
   2. **Integration Tests:** `cargo test --test '*'` (test regex patterns, BERT-tiny loading, gRPC comms).
  3. **Security Checks:** `cargo audit` (check for vulnerable dependencies).
  4. **Code Coverage:** `tarpaulin` (aim for >80%).
  5. **Linting:** `cargo clippy` (enforce style standards).
  - **Failure Handling:** PR blocks merge if tests fail.

#### A3. Documentation Build (`.github/workflows/docs.yml`)
- **Trigger:** On push to main (docs/* changed).
- **Steps:**
  1. Build docs: `cargo doc --no-deps`
  2. Deploy to GitHub Pages: `peaceiris/actions-gh-pages@v3`
  3. Result: Docs auto-published to `nodeguarder.github.io`

---

### B. Distribution Strategy Phases

#### Phase 1: Internal MVP Testing (Weeks 1-8)
- **Distribution:** GitHub Releases (private link shared to internal testers only).
- **Signing:** Self-signed certificate (free).
- **Target Users:** Internal QA team, early adopters, beta testers.
- **Known Limitation:** "Unknown Publisher" warning on install (acceptable for testing).
- **NOT promoted publicly yet.**

#### Phase 2: Public MVP Launch (Week 9+)
- **Prerequisite:** Purchase EV Code Signing Certificate (~$300-350).
- **Action:** Re-sign all v1.0.0 binaries with EV cert.
- **Distribution:** GitHub Releases (public link on nodeguarder.com).
- **Signing:** EV Code Signing Certificate (professional, no warnings).
- **Target Users:** Developers, early adopters, enterprise prospects.
- **Launch:** Announce on Product Hunt, HackerNews, Twitter, developer communities.

---

## 12. Installation & Setup Experience

### A. Windows Installer (MSI / NSIS)
- **Installer Type:** MSI (Windows Installer) for enterprise compatibility. Alternative: NSIS (Nullsoft) for lighter footprint.
- **MSI Advantages:** Integrates with Windows Add/Remove Programs, supports silent/enterprise deployment, rollback capability.
- **Installation Flow (User-Facing):**
  1. User downloads `NodeGuarder-1.0.0.exe` (self-extracting MSI, ~15MB, model downloaded on first run).
  2. Double-click installer → Windows UAC prompt (admin required for system integration).
  3. Welcome screen (no splash art, professional):
     - Title: "NodeGuarder Local — Semantic Firewall for AI"
     - Description: "Protect sensitive data before it reaches cloud LLMs."
     - Buttons: [Install] [Cancel]
  4. Installation Destination (default: `C:\Program Files\NodeGuarder\` or `%PROGRAMFILES%\NodeGuarder\`).
  5. System Tray Integration checkbox (enabled by default): "Launch NodeGuarder on Windows startup."
  6. License Agreement (MIT or Apache 2.0 — single page, scrollable).
  7. Installation summary: "Ready to install. Click Install to proceed."
  8. Progress bar: "Installing NodeGuarder...", "Downloading model...", "Registering system components..."
  9. Completion screen:
     - "Installation successful!"
     - `Agent UUID: a1b2c3d4-...` (displayed, copyable)
     - `API Endpoint: http://localhost:51820/v1` (copyable)
     - Checkbox: "Open Settings on completion" (checked by default).
     - Buttons: [Finish] [Copy Configuration]
  10. If checkbox enabled → Settings window opens immediately showing "Status" tab with next steps.

### B. Post-Installation Setup
- **First Run:** Agent generates UUID + Bearer token, stores in `%APPDATA%\NodeGuarder\config`. No cloud registration.
   - **BERT-tiny Model Download:**
  - On first launch (with `--features semantic`), agent downloads BERT-tiny model (~4.5MB) from HuggingFace CDN.
  - Download happens in background (non-blocking). Progress shown in tray tooltip: "Downloading model... 45%"
  - If download fails: User can retry manually from Settings → Advanced → "Check Model Status".
- **System Permissions:**
  - Agent requests `localhost` binding permission (no firewall rule needed for local proxy).
  - For Enterprise enrollment (post-MVP): Windows Firewall rules configured to allow only Admin Platform IP outbound.

### C. Uninstall & Removal
- **Via Add/Remove Programs (Windows Settings → Apps → Apps & Features):**
  1. User searches "NodeGuarder" → clicks "Uninstall".
  2. UAC prompt (admin required).
  3. Uninstall confirmation: "Uninstall NodeGuarder Local?" with checkbox "Remove local configuration and logs".
     - **Unchecked (default):** Keeps `%APPDATA%\NodeGuarder\` directory (preserves UUID, config, local logs for reinstall).
     - **Checked:** Deletes entire `%APPDATA%\NodeGuarder\` directory (clean slate). Enrolled agents lose local-only fallback logs.
  4. Progress bar: "Uninstalling NodeGuarder..."
  5. Completion: "NodeGuarder has been uninstalled. Restart Windows to remove system components (optional)."
- **System Cleanup:**
  - Removes `C:\Program Files\NodeGuarder\` directory (binary, dependencies).
  - Removes System Tray auto-start entry from Windows Registry (HKCU\Software\Microsoft\Windows\CurrentVersion\Run).
  - Leaves `%APPDATA%\NodeGuarder\` untouched (unless user checked "Remove configuration").
  - **No Registry bloat:** Only writes Run key (standard Windows practice).

### D. Repair / Modify Installation
- **Repair Option (in Add/Remove Programs):**
  - User can click "Modify" or "Repair" to:
    - Re-download BERT-tiny model (if corrupted).
    - Reset agent configuration (clears UUID, generates new one).
    - Reinstall System Tray integration.
  - Useful if agent crashes or becomes unresponsive.

### E. Silent Installation (Enterprise)
- **MSI Command-Line Options:**
  ```powershell
  # Install silently, no UI
  msiexec /i NodeGuarder-1.0.0.msi /quiet /norestart
  
  # Install with custom path
  msiexec /i NodeGuarder-1.0.0.msi /quiet INSTALLDIR="C:\NodeGuarder" /norestart
  
  # Install + auto-start on login
  msiexec /i NodeGuarder-1.0.0.msi /quiet AUTOSTART=1 /norestart
  
  # Uninstall silently
  msiexec /x NodeGuarder-1.0.0.msi /quiet /norestart
  ```
- **Use Case:** IT admins can deploy to 100+ developer machines via Group Policy or Intune.
- **Post-Install Script:** GPO can auto-configure agent enrollment code: Write enrollment code to `%APPDATA%\NodeGuarder\config.toml`, agent enrolls on first run.

### F. Upgrade / Version Management
- **In-Place Upgrade:**
  - User downloads v1.1.0 installer, runs it → Detects existing v1.0.0.
  - Installer backs up old `%APPDATA%\NodeGuarder\config` and `agent.log`.
  - Upgrades binary in `C:\Program Files\NodeGuarder\`.
  - Preserves UUID, Bearer token, local allowlists, enrollment status.
  - **Downgrade:** Not supported. Users cannot downgrade to older versions (prevents security regressions).
- **Rollback on Failed Upgrade:**
  - If v1.1.0 fails to start, Windows rollback script restores v1.0.0 from backup.
  - User notified via tray: "Agent rolled back to v1.0.0. Contact support if issue persists."

### G. Installation File & Code Signing
- **Installer Filename:** `NodeGuarder-{version}-{architecture}.exe` (e.g., `NodeGuarder-1.0.0-x86-64.exe`).
- **Size:** ~15MB (includes ATR rules + BERT-tiny model downloaded on first run).
- **Code Signing:** Signed with self-signed cert (Phase 1, MVP) or EV cert (Phase 2, public launch).
- **Checksum Verification:** SHA-256 published on GitHub Releases. Users can verify integrity:
  ```powershell
  certutil -hashfile NodeGuarder-1.0.0-x86-64.exe SHA256
  ```

---

## 12. Go-to-Market & Website Strategy

### A. Landing Page (nodeguarder.com)
- **Static Site** (Hugo / Vercel): Fast, low-cost hosting.
- **Sections:**
  - Hero: "What you type stays local. What the cloud sees is safe."
  - Feature comparison: Free Agent vs. Enterprise Portal (clear separation).
  - Installation guide: 3-step quick start for Agent.
  - Documentation: API, CLI, IDE setup (links to GitHub Wiki/Docs).
  - Pricing: Transparent tiers for Admin Platform (separate section).
  - Blog: Security best practices, release notes, case studies.

### B. Dual CTA Strategy
- **Primary CTA (Top-Right / Hero):** "Download Agent (Windows)" → Direct link to latest GitHub Release `.exe`.
  - Target: Individual developers, self-hosted teams.
  - No signup required; fully functional standalone.
  - Subtitle: "100% open-source. Runs locally. No cloud required."
- **Secondary CTA (Enterprise Section):** "Book a Demo" → Contact form (email capture).
  - Target: DevSecOps teams, enterprises, orgs wanting centralized management.
  - Demo flow: Sales rep shows Admin Portal, demonstrates agent enrollment workflow (how to onboard existing agents), discusses pricing/licensing.
  - Follow-up: 30-day trial license for Admin Platform (unlimited agents).
  - **Key talking point:** "Already have agents installed? Enroll them in minutes with a single enrollment code. No re-installation required."
- **Tertiary Fallback:** GitHub link for advanced users (source code, build from scratch).

### C. Website Sections
- **"For Developers"** (Left column)
  - Free, open-source agent.
  - Download button (Windows `.exe`).
  - "Install in 3 steps" quick-start guide.
  - FAQ: Does it slow down my IDE? (No, <100ms overhead). Is my data safe? (Yes, 100% local).

- **"For Teams & Enterprises"** (Right column)
  - Centralized fleet management, audit logs, policy enforcement.
  - "Book a Demo" button.
  - Feature comparison (Agent vs. Portal).
  - What's included: 30-day trial, onboarding support.

### D. Community & Social
- **GitHub Discussions:** Community support and feature requests.
- **Twitter/X:** Release announcements, security tips.
- **Docs Site:** Hosted on GitHub Pages or Vercel; searchable.

### E. Enterprise Sales (Phase 2)
- **Sales Channel:** Direct outreach to DevSecOps teams; partnerships with CI/CD vendors.
- **Demo Process:** 
  1. User clicks "Book a Demo" → Calendly/Typeform captures info (org size, use case, timeline).
  2. Sales rep schedules 30-min call, walks through Admin Portal, answers licensing questions.
  3. Trial license issued (30 days, unlimited agents, full feature access).
  4. Success metrics: Agent adoption, audit log volume, policy enforcement adoption.
- **Conversion:** Post-trial, enterprise pricing proposal sent (tiered by agent count).
- **Support:** Email/Slack support tier for paying customers.

---

## 13. Security Posture & Trust
- **Agent Transparency:** Full source code auditable (open-source). No telemetry or phoning home (unless Admin Platform connected).
- **Admin Platform:** Closed-source but self-hosted (no data leaves customer infrastructure). gRPC traffic encrypted with mTLS.
- **Vulnerability Disclosure:** Security.txt at nodeguarder.com; bug bounty program (post-MVP).
- **Compliance:** Regular third-party security audits (post-MVP, annual). Published audit reports on website.
- **Key Rotation:** Admin Platform supports periodic cert rotation for mTLS (quarterly recommended).