# NodeGuarder Context

NodeGuarder is a private, self-hosted Linux server monitoring solution.

## Project Structure

### 1. Agent (`/agent`)
- **Language**: Go (v1.21+)
- **Tech**: eBPF (`cilium/ebpf`) for deep observability.
- **Function**: Runs on client servers. Collects metrics (CPU, Mem, Disk), monitors Cron Jobs, and detects File Drift.
- **Build**: `go build -o nodeguarder-agent .`

### 2. Backend (`/dashboard/backend`)
- **Language**: Go (Fiber framework)
- **Database**: SQLite (`mattn/go-sqlite3`).
- **Auth**: JWT-based authentication.
- **Function**: Receives data from agents, stores metrics, serves the API.
- **Key Files**: `handlers/`, `models/`, `license/`.

### 3. Frontend (`/dashboard/frontend`)
- **Language**: TypeScript / React (Vite).
- **Styling**: TailwindCSS (or vanilla CSS).
- **Libraries**: `recharts` for graphs, `lucide-react` for icons.
- **Build**: `npm run build` -> `dist/`.

### 4. Deployment (`/deploy`)
- **Method**: Docker Compose.
- **Files**:
    -   `docker-compose.yml`: Development/Build setup (Includes License Generator).
    -   `docker-compose.customer.yml`: Production/Registry setup (Secure, image-based).
    -   `package_release.sh`: Offline package builder.

## Coding Guidelines
- **Go**: Use standard format (`gofmt`). Error handling is critical.
- **React**: Functional components. Use Hooks.
- **Security**: Never commit `private.key` or real `license.yaml`.
- **Testing**: Run `./wsl_test.sh` for full integration tests.
