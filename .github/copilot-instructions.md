# Copilot Instructions for Linux Health Agent

A self-hosted Linux monitoring system with lightweight agents reporting to a central dashboard. No external data transmission—all infrastructure stays on-premises.

## Architecture Overview

**Three-layer system:**
- **Agent Layer** (Go binary, deployed on each monitored Linux server)
  - Collects: CPU/RAM/disk metrics, OS info, drift detection (SHA256 hashing `/etc`), cron status
  - Communicates: HTTPS push to dashboard backend at configured intervals (default 10s)
  - Registration: Agents self-register on first run with `server_id` and `api_secret`
  
- **Backend Layer** (Fiber/Go HTTP server in Docker)
  - Endpoints: Agent registration/metrics/events, admin auth (JWT), data queries
  - Database: SQLite with `servers`, `metrics`, `events`, `users` tables
  - Key handlers in `dashboard/backend/handlers/`: `agent.go` (registration/data), `auth.go` (JWT), `servers.go` (queries)
  
- **Frontend Layer** (React 18 + Vite in Docker, served by Nginx)
  - Uses `api.js` axios client with JWT token injection via interceptors
  - Pages: `Login.jsx` (admin auth), `Dashboard.jsx` (server list, metrics, alerts)
  - Nginx reverse proxy on 8443 (HTTPS) → backend (8081) + frontend (3000)

**Data flow:** Agent → `POST /api/metrics` → Backend SQLite → Frontend reads via GET endpoints

## Key Development Workflows

### Agent Development
```bash
# Build
cd agent && go build -o health-agent .

# Test locally (requires config file)
mkdir -p /tmp/test-agent
cat > /tmp/test-agent/config.yaml <<EOF
server_id: test-$(uuidgen)
api_secret: dev-secret
dashboard_url: http://localhost:8081
interval: 5
EOF

./health-agent --config /tmp/test-agent/config.yaml

# Cross-compile for deployment
GOOS=linux GOARCH=amd64 go build -o health-agent-linux-amd64 .
GOOS=linux GOARCH=arm64 go build -o health-agent-linux-arm64 .
```

### Dashboard Development
```bash
# Backend only (requires DB_PATH and PORT env vars)
cd dashboard/backend && go run main.go
# Defaults: DB_PATH=./data/health.db, PORT=8080

# Full stack with Docker Compose
cd deploy && docker compose up -d

# Access: https://localhost:8443 (self-signed cert for dev)
# Default admin created via migrations in schema.sql
```

### Testing
```bash
# Agent tests
cd agent && go test ./...

# Backend tests  
cd dashboard/backend && go test ./...
```

## Critical Patterns & Conventions

### Agent Authentication
- No traditional login; agents authenticate via `api_secret` in request body (bcrypt hashed in DB)
- Agents auto-register if `server_id` doesn't exist; updates last_seen if exists
- Each agent push includes: `server_id`, `api_secret`, `timestamp`, metrics JSON

### Metric Collection
- `collector.Collect()` in `agent/collector/collector.go` gathers CPU/RAM/disk/load/process count
- Metrics use `gopsutil` library for cross-platform OS metrics
- Stored in SQLite `metrics` table with server_id + timestamp index
- Frontend fetches last N metrics for charting

### Drift Detection  
- `detector.Check()` in `agent/drift/detector.go` computes SHA256 hash of `/etc` directory tree
- Ignores permission errors and symlinks
- Compares against `lastChecksum`; event generated if changed
- Checksum stored in `servers.drift_checksum`, boolean `drift_changed` flag

### Error Handling Conventions
- Backend returns `{"error": "message"}` JSON on errors with appropriate HTTP status
- Fiber `ErrorHandler` centralizes error responses (see `backend/main.go`)
- Agents log failures and retry via local queue before dropping

### API Security (MVP)
- Admin login required for `/api/servers`, `/api/metrics/history` (JWT middleware in `dashboard/backend/middleware/auth.go`)
- Agent endpoints (`/api/register`, `/api/metrics`) are public but require valid `api_secret` in body
- Frontend uses `axios` interceptor to attach JWT token; redirects to `/login` on 401

## File Structure & Key References

```
agent/
├── main.go              # CLI (--install, --config flags), systemd service setup
├── api/client.go        # HTTP client for push operations
├── collector/           # gopsutil-based metrics gathering
├── drift/               # SHA256 directory hashing
└── config/              # Config file parsing (YAML)

dashboard/backend/
├── main.go              # Fiber app setup, middleware, routes
├── handlers/            # Request handlers grouped by concern
│   ├── agent.go         # Registration, metrics, events endpoints
│   ├── auth.go          # JWT login/token validation
│   └── servers.go       # Server list, detail queries
├── middleware/auth.go   # JWT token verification
├── models/              # Data structures (Server, Metric, Event)
├── database/            # SQLite schema, query helpers
└── Dockerfile           # Multi-stage build: `go build` → binary

dashboard/frontend/src/
├── services/api.js      # Axios instance with interceptors
├── pages/               # Route-based components
│   ├── Login.jsx
│   └── Dashboard.jsx
└── components/          # Reusable UI (StatusBadge, Navbar)

deploy/
├── docker-compose.yml   # Services: backend, frontend, nginx
├── nginx.conf           # Reverse proxy (8443→backend/frontend)
├── Dockerfile.*         # Multi-stage builds for agent & backend
└── schema.sql           # SQLite schema (auto-run on backend start)
```

## Database & API Contracts

**Key Tables & Indexes:**
- `servers(id TEXT PRIMARY KEY, ...)` — agent-indexed by SHA256(server_id)
- `metrics(id, server_id, timestamp, ...)` — indexed `(server_id, timestamp DESC)`
- `events(id, server_id, timestamp, event_type, severity, message, details)`

**Agent Endpoints:**
- `POST /api/register` → `AgentRegister()` — accepts RegisterRequest, upserts server
- `POST /api/metrics` → `SendMetrics()` — accepts MetricsRequest, inserts metric row + events
- `POST /api/events` → `SendEvents()` — accepts EventsRequest, inserts event rows

**Admin Endpoints (JWT required):**
- `GET /api/servers` → server list with last-seen status
- `GET /api/servers/{id}/metrics` → metric history for dashboard charting
- `POST /login` → username + password → JWT token
- `GET /health` — liveness check (no auth)

## Deployment Notes

1. **License enforcement**: Dashboard reads `license.yaml` at startup; enforces `max_servers` and `expires` on agent registration (see handlers/agent.go)
2. **Self-signed certs for MVP**: Agent client accepts InsecureSkipVerify in TLS config
3. **Data persistence**: Bind mount `./data` volume for SQLite database across restarts
4. **Environment variables**: Backend reads `DB_PATH` and `PORT`; frontend reads `VITE_API_URL`

## Common Development Tasks

- **Add new metric**: Update `Metric` struct in models.go + collector.Collect() + database schema
- **Add new event type**: Define `event_type` string in models.Event + insert in agent/backend code
- **Custom drift monitoring**: Extend `drift/detector.go` path or add new detector instance in main.go
- **Change collection interval**: Update `interval` field in agent config.yaml (seconds)

## Testing Checklist

- Agent builds and registers on first run (inspect SQLite with `sqlite3 data/health.db`)
- Dashboard login works, JWT token persists in localStorage
- Metrics appear in `metrics` table with correct server_id
- Drift detection triggers event when `/etc/hosts` changes
- Nginx reverse proxy correctly routes traffic on 8443
