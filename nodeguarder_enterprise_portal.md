# NodeGuarder Enterprise Portal
**Version:** 1.0
**Status:** MVP / Integrated
**Architecture:** Single Binary — Agent + Portal merged

---

## 1. Architecture Overview

NodeGuarder Enterprise Portal is not a separate codebase — it's the same `nodeguarder-agent.exe` binary built with `--features enterprise`. The `--portal` CLI flag starts the REST API server + gRPC server + database connection, providing centralized fleet management for enrolled agents.

```
┌─────────────────────────────────────────────────────┐
│  nodeguarder-agent.exe                               │
│                                                       │
│  Default mode (no flags)     --portal flag            │
│  ┌─────────────────────┐   ┌───────────────────────┐  │
│  │ Local Agent          │   │ Enterprise Portal     │  │
│  │ • Proxy (port 51820) │   │ • REST API (port 3000)│  │
│  │ • Detection engine   │   │ • gRPC (port 50051)   │  │
│  │ • HITL modal         │   │ • Postgres connection  │  │
│  │ • Tray UI            │   │ • Auth (JWT)           │  │
│  │ • gRPC client        │   │ • React frontend       │  │
│  └─────────────────────┘   └───────────────────────┘  │
│                │                      │                │
│         Agent mode              Portal mode            │
│         (local proxy)           (management server)    │
└─────────────────────────────────────────────────────┘
```

---

## 2. Building & Running

### Prerequisites
- Rust 1.78+ with MSVC toolchain
- PostgreSQL 15+ (Docker recommended for dev)
- protoc (protobuf compiler)
- Node.js 20+ (for frontend)

### Build portal binary
```powershell
cd agent
cargo build --release --features enterprise
```

### Run portal (development)
```powershell
# Start PostgreSQL via Docker
docker run -d --name ng-postgres ^
  -e POSTGRES_DB=nodeguarder ^
  -e POSTGRES_USER=ng_admin ^
  -e POSTGRES_PASSWORD=ng_password ^
  -p 5433:5432 ^
  postgres:15-alpine

# Run portal (migrations run automatically on startup)
$env:DATABASE_URL="postgres://ng_admin:ng_password@localhost:5433/nodeguarder"
$env:JWT_SECRET="dev-secret"
$env:REST_ADDR="0.0.0.0:3000"
$env:GRPC_ADDR="0.0.0.0:50051"
target\release\nodeguarder-agent.exe --portal
```

### Run frontend (development)
```powershell
cd enterprise-portal/frontend
npm install
npm run dev  # starts on http://localhost:5173
```

### Docker Compose (production)
```yaml
services:
  postgres:
    image: postgres:15-alpine
    ports: ["5433:5432"]
    environment:
      POSTGRES_DB: nodeguarder
      POSTGRES_USER: ng_admin
      POSTGRES_PASSWORD: ${DB_PASSWORD}

  pgbouncer:
    image: edoburu/pgbouncer:latest
    ports: ["6432:6432"]

  api:
    build:
      context: ../agent
      dockerfile: Dockerfile.portal
    ports: ["3000:3000", "50051:50051"]
    environment:
      DATABASE_URL: postgres://ng_admin:${DB_PASSWORD}@postgres:5432/nodeguarder
      JWT_SECRET: ${JWT_SECRET}

  ui:
    build: ./frontend
    ports: ["5173:80"]
    environment:
      VITE_API_URL: http://localhost:3000
```

---

## 3. Portal Components

### 3.1 REST API (Axum, port 3000)

| Endpoint | Method | Description |
|---|---|---|
| `/api/v1/auth/login` | POST | JWT login (admin@nodeguarder.local / admin123) |
| `/api/v1/auth/me` | GET | Current user info |
| `/api/v1/dashboard/summary` | GET | Dashboard statistics |
| `/api/v1/agents` | GET | List agents (paginated, filterable) |
| `/api/v1/agents/:uuid` | GET | Agent detail + recent logs |
| `/api/v1/agents/:uuid/revoke` | POST | Revoke agent |
| `/api/v1/policies` | GET/POST | List/create policies |
| `/api/v1/policies/:id` | GET/PATCH/DELETE | Get/update/delete policy |
| `/api/v1/policies/:id/deploy` | POST | Deploy policy to agents |
| `/api/v1/audit-logs` | GET | Query audit logs (paginated, filterable) |
| `/api/v1/enrollment-codes` | GET/POST | List/generate codes |
| `/api/v1/enrollment-codes/:code` | DELETE | Revoke code |
| `/api/v1/users` | GET/POST | List/create users |
| `/api/v1/users/:id` | DELETE | Delete user |
| `/api/v1/health` | GET | Health check |
| `/healthz`, `/readyz` | GET | Kubernetes liveness/readiness |

### 3.2 gRPC Server (Tonic, port 50051)

| RPC | Direction | Description |
|---|---|---|
| `RegisterAgent` | Agent → Portal | Register agent with enrollment code |
| `PushLogs` | Agent → Portal | Upload batched audit logs |
| `GetPolicy` | Agent → Portal | Fetch latest policy enforcement |
| `Heartbeat` | Agent → Portal | Keepalive + status update |

Proto definition: `agent/proto/agent.proto`

### 3.3 Database (PostgreSQL)

Schema: `agent/migrations/001_initial_schema.sql`

Key tables:
- `organizations` — Multi-tenant orgs
- `users` — Admin, SecurityOps, Auditor roles
- `agents` — Registered agent fleet (uuid, hostname, status, last_seen)
- `policies` — Enforcement policies with 15+ override fields
- `audit_logs` — Partitioned by month (Q1-Q4 2026+ via `002_auto_partitions.sql`)
- `enrollment_codes` — One-time use, TTL-limited

### 3.4 Frontend (React 18 + TypeScript + Vite + Tailwind)

Pages:
- **Login** — JWT authentication
- **Dashboard** — Summary cards (agents, flags, policies, compliance)
- **Agents** — Fleet table with status, search, revoke
- **Policies** — Create/edit/deploy policies with all enforcement fields
- **Audit Logs** — Paginated, filterable log viewer
- **Users** — Team management
- **Enrollment Codes** — Generate/revoke one-time codes

---

## 4. Policy Enforcement Model

Policies are "sets of overrides" — each enforce* field in PolicyEnforcement determines whether the corresponding value is pushed to the agent. Unenforced fields leave the agent's local value intact.

### All 15 PolicyEnforcement Fields

| # | Field | Type | Portal UI | Description |
|---|---|---|---|---|
| 1 | `redaction_enforced` | bool | checkbox | Master toggle — blocks "Allow" in HITL modal |
| 2 | `upstream_url_enforced` | bool | implicit† | Whether to override agent's upstream URL |
| 3 | `upstream_url` | string | text input | Upstream LLM endpoint override |
| 4 | `upstream_api_key_enforced` | bool | implicit† | Whether to override agent's API key |
| 5 | `upstream_api_key` | string | password input | Upstream LLM API key override |
| 6 | `bind_port_enforced` | bool | implicit† | Whether to override agent's bind port |
| 7 | `bind_port` | int32 | number input | Local proxy port override |
| 8 | `ocr_enforced` | bool | implicit† | Whether to override OCR setting |
| 9 | `enable_ocr` | bool | checkbox | OCR scanning toggle |
| 10 | `atr_auto_update_enforced` | bool | implicit† | Whether to override ATR auto-update |
| 11 | `disable_atr_auto_update` | bool | checkbox | Disable weekly ATR rule updates |
| 12 | `allow_custom_allowlists` | bool | checkbox | Allow agents to add local allowlists |
| 13 | `enabled_detection_categories` | string[] | array input | Active detection categories (empty = all) |
| 14 | `custom_regex` | string[] | array input | Custom regex patterns for detection |
| 15 | `allowlists` | string[] | array input | Allowlist patterns (bypass detection) |

† Implicit enforcement: if the field has a non-null value in the policy, it is enforced. For boolean fields (enable_ocr, disable_atr_auto_update), the checkbox always sends a value, so these are always enforced when set.

### Enforcement ↔ Agent UI Mapping

When a policy is deployed, the portal gRPC handler returns a `PolicyEnforcement` message. The agent's `sync.rs` applies these fields to local config and pushes enforcement flags to the UI via `UiEvent::UpdateConfigInUI`. The JS `renderEnforcement()` function grays out settings and shows lock banners:

| Portal Field | Agent UI Effect |
|---|---|
| `redaction_enforced` | Hides "Allow" button in HITL modal |
| `upstream_url_enforced` | Disables upstream URL input + save button |
| `upstream_api_key_enforced` | Disables API key input + save button |
| `ocr_enforced` | Disables OCR toggle |
| `atr_auto_update_enforced` | Disables ATR auto-update toggle |
| `detectionTogglesEnforced` | Disables all 10 detection category toggles |
| `allow_custom_allowlists` | Hides allowlist add/delete controls |

---

## 5. Agent Enrollment Flow

```
Admin Portal              Agent (Tray UI)              Portal gRPC
     │                         │                           │
     │  Generate Code           │                           │
     │  (Settings → Codes)      │                           │
     │                         │                           │
     │  Share code with dev     │                           │
     │  (Slack/email/Wiki)      │                           │
     │                         │                           │
     │                    Enter URL + Code                  │
     │                    (Connectivity tab)                │
     │                         │                           │
     │                         ├── RegisterAgent() ───────►│
     │                         │   (uuid, hostname, key)   │
     │                         │                           │
     │                         │◄── RegisterResponse ─────┤
     │                         │   (mTLS cert, org_id)     │
     │                         │                           │
     │                    Enrolled!                         │
     │                    (icon turns blue)                 │
     │                         │                           │
     │  Agent appears in        │                           │
     │  Dashboard (online)      │                           │
```

Post-enrollment, the agent:
- Pushes audit logs every 5 minutes via `PushLogs`
- Pulls policy every 5 minutes via `GetPolicy`
- Sends heartbeat updates via `Heartbeat`

### Mock Enrollment (Development)

For local testing without a portal, use enrollment code `ENV-MOCK-TEST`:
- Bypasses gRPC entirely
- Sets `enrolled = true`, all detections enabled, redaction enforced
- Settings pre-grayed for UI testing
- No network calls needed

---

## 6. Key Files & Directories

```
agent/
├── proto/agent.proto              # gRPC contract (single source of truth)
├── migrations/
│   ├── 001_initial_schema.sql     # Portal database schema
│   └── 002_auto_partitions.sql    # Audit log partition auto-creation
├── src/
│   ├── main.rs                    # --portal flag + run_portal()
│   ├── sync.rs                    # Policy sync engine (enrollment, heartbeat)
│   ├── config.rs                  # AppConfig (bind_port, enrolled_admin, etc.)
│   ├── ui/
│   │   └── windows.rs             # Agent UI (settings HTML/JS, renderEnforcement)
│   └── portal/
│       ├── mod.rs                 # Portal module root
│       ├── auth.rs                # JWT auth (FromRequestParts)
│       ├── db.rs                  # Database initialization + migrations
│       ├── models.rs              # All portal structs (Policy, Agent, User, etc.)
│       ├── mtls.rs                # mTLS certificate generation
│       ├── handlers/              # REST API route handlers
│       │   ├── auth.rs, agents.rs, policies.rs, audit_logs.rs
│       │   ├── dashboard.rs, enrollment_codes.rs, users.rs, health.rs
│       │   └── mod.rs
│       └── grpc/
│           ├── mod.rs             # Proto module declarations
│           └── agent_controller.rs # gRPC service implementation
├── Dockerfile.portal              # Docker build for portal mode
├── Cargo.toml                     # enterprise feature gates portal deps
└── Dockerfile.portal              # Multi-stage Docker build

enterprise-portal/
├── docker-compose.yml             # Postgres + PgBouncer + Portal + UI
├── .env.example                   # DB_PASSWORD, JWT_SECRET, RUST_LOG
├── frontend/                      # React 18 + TypeScript + Vite
│   ├── src/
│   │   ├── pages/                 # Login, Dashboard, Agents, Policies, etc.
│   │   ├── api/client.ts          # API client (JWT auth, all endpoints)
│   │   └── types/index.ts         # TypeScript interfaces
│   ├── Dockerfile                 # Nginx container for static build
│   └── package.json
└── backend/                       # (deleted — code lives in agent/src/portal/)
```

---

## 7. Development Workflow

### First-time setup
```powershell
# 1. Start PostgreSQL
docker run -d --name ng-postgres -e POSTGRES_DB=nodeguarder -e POSTGRES_USER=ng_admin -e POSTGRES_PASSWORD=ng_password -p 5433:5432 postgres:15-alpine

# 2. Run portal (migrations auto-run)
$env:DATABASE_URL="postgres://ng_admin:ng_password@localhost:5433/nodeguarder"
$env:JWT_SECRET="dev-secret"
cd agent && cargo run --features enterprise -- --portal

# 3. In another terminal, start frontend
cd enterprise-portal/frontend && npm run dev

# 4. Login at http://localhost:5173
#    Email: admin@nodeguarder.local
#    Password: admin123
```

### Testing enrollment
```powershell
# Generate an enrollment code via API
curl -X POST http://localhost:3000/api/v1/enrollment-codes `
  -H "Authorization: Bearer $(curl -s http://localhost:3000/api/v1/auth/login -d '{\"email\":\"admin@nodeguarder.local\",\"password\":\"admin123\"}' | python -c "import sys,json;print(json.load(sys.stdin)['token'])")" `
  -H "Content-Type: application/json" -d "{}"

# Or use mock code ENV-MOCK-TEST directly in agent UI
```

---

## 8. Database Schema (Summary)

```
organizations (id, name, created_at)
    │
    ├── users (id, org_id, email, password_hash, role, ...)
    │
    ├── agents (uuid, org_id, hostname, status, last_seen, ...)
    │
    ├── policies (id, org_id, name, redaction_enforced,
    │     upstream_url, upstream_api_key, bind_port,
    │     enable_ocr, disable_atr_auto_update, allow_custom_allowlists,
    │     detection_overrides, custom_regex, allowlists,
    │     target_mode, target_regex, ...)
    │
    ├── audit_logs (id, org_id, agent_uuid, content_type, severity,
    │     action_taken, detection_method, ...) PARTITION BY RANGE (flagged_at)
    │
    └── enrollment_codes (id, org_id, code, expires_at, used_by, ...)
```

---

## 9. Security Model

- **REST API:** JWT tokens (24h expiry), validated on every request via `AuthenticatedUser` extractor
- **gRPC:** mTLS — each agent receives a unique certificate signed by the portal's CA on enrollment
- **Audit logs:** Encrypted at-rest (AES-256), actual secrets never logged — only content type and action
- **PostgreSQL:** Private to Docker network, no external port exposure
- **Default credentials:** `admin@nodeguarder.local` / `admin123` — change in production

---

## 10. Migration from Separate Backend

The portal backend was merged into `agent/src/portal/` to create a single binary. Key changes:
- `enterprise-portal/backend/` directory deleted (dead code)
- Feature flag `enterprise` gates gRPC server, database, REST API dependencies in `Cargo.toml`
- `--portal` flag in `main.rs` starts Axum + Tonic + database instead of the local agent proxy
- Proto in `agent/proto/agent.proto` is the shared single source of truth (not duplicated)
- Migrations in `agent/migrations/` serve all modes
- Docker builds from `agent/Dockerfile.portal` for portal mode
