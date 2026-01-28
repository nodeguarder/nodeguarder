# Development Guide

This guide covers the architecture, local development, building images, and the release process for NodeGuarder.

## Table of Contents
- [Architecture](#architecture)
- [Local Development](#local-development)
- [Building Images](#building-images)

- [Release Process](#release-process)

## Architecture

The system consists of three main components:
1.  **Agent**: A lightweight Go binary running on monitored Linux servers.
2.  **Backend**: A Go (Fiber) API server managing data and licensing.
3.  **Frontend**: A React (Vite) dashboard for visualization.

### Project Structure
```
root/
├── agent/                  # Agent source code
├── dashboard/
│   ├── backend/            # API Server source code
│   └── frontend/           # React App source code
├── deploy/                 # Docker & Deployment scripts
└── docs/                   # Documentation
```

---

## Local Development

### Prerequisites
- Go 1.21+
- Node.js 18+
- Docker & Docker Compose
- **Linux Only**: `clang`, `llvm`, `libbpf-dev` (for eBPF compilation)

### Running with Docker Compose (Recommended)
This is the easiest way to run the full stack (Back + Front + Database) locally.
```bash
cd deploy
# Builds from source and enables License Generator
docker-compose up -d --build
```
*   **Source**: Builds directly from your local `agent/`, `dashboard/backend/`, and `dashboard/frontend/` directories.
*   **Secrets**: Mounts your local `private.key`, enabling the License Generator.
*   **URL**: https://localhost:8443

To simulate the **Customer Experience** (using the pre-built image without secrets):
```bash
cd deploy
docker-compose -f docker-compose.customer.yml up -d
```

### Running Components Individually

#### 1. Backend
```bash
cd dashboard/backend
go mod download
# Set required env vars
export INCLUDE_LICENSE_GENERATOR=true
export ADMIN_PASSWORD=admin
go run main.go
```

#### 2. Frontend
```bash
cd dashboard/frontend
npm install
npm run dev
```

#### 3. Agent
```bash
cd agent
go build -o nodeguarder-agent .
./nodeguarder-agent --connect http://localhost:8080 --token <REGISTRATION_TOKEN>
```

#### 4. Agent Binaries
Binaries are automatically built and embedded when you build the Docker image (using `deploy/Dockerfile`).
To verify them locally without a full build:
```bash
cd agent
# Linux (Requires Clang/LLVM for eBPF)
go generate ./...
go build -o nodeguarder-agent .
```

#### 5. Integration Testing
We use a comprehensive WSL/Linux bash script to verify the entire stack (install, drift, cron, health):
```bash
# Run from WSL or Linux
cd tests
./wsl_test.sh
```
This script handles cleanup, environment setup, and full scenario verification.

### 4. Database Migrations
We use SQLite. For schema changes:
1.  **Modify `schema.sql`**: Update the schema for *new* installations.
2.  **Modify `db.go`**: Add a migration function (e.g., `migrateAlertSettings`) to `runMigrations()` to apply `ALTER TABLE` statements for *existing* installations.
    *   *Note*: SQLite does not support `IF NOT EXISTS` for `ADD COLUMN` in all versions, so check for error "duplicate column name" and ignore it.

---

## Building Images

We use a single unified image for distribution.

### Build Script
The easiest way to build is using the provided script:
```bash
cd deploy
./build-images.sh 1.0.0
```

This generates:
1.  `nodeguarder:1.0.0`
2.  `:latest` tag.

### Manual Build
```bash
docker build -f deploy/Dockerfile -t nodeguarder:latest .
```

---



## Release Process

### Pre-Release Checklist
1.  **Code Review**: Verify no debug code or hardcoded secrets.
2.  **Tests**: Run `go test ./...` in agent and backend.
3.  **Lint**: Run `npm run lint` in frontend.

### Creating a Release

We have automated scripts to handle versioning and packaging.

1.  **Bump Version**:
    Run the script to update version strings across the codebase (Backend, Frontend, Docker Compose):
    ```bash
    ./deploy/bump-version.sh 1.2.0
    ```

2.  **Build Deployment Image**:
    Build the Docker image that will be pushed to the registry:
    ```bash
    ./deploy/build-images.sh 1.2.0
    ```

3.  **Package for Distribution**:
    Create the zip files for GitHub Releases (Online and Offline):
    ```bash
    ./deploy/package_release.sh 1.2.0
    ./deploy/package_release.sh 1.2.0 --offline
    ```
    *Output*: 
    - `dist/nodeguarder-deploy-1.2.0.zip` (Online)
    - `dist/nodeguarder-offline-1.2.0.zip` (Offline)

4.  **Commit, Tag & Push**:
    ```bash
    git commit -am "Bump version to 1.2.0"
    git tag v1.2.0
    git push origin master --tags
    ```

5.  **Publish**:
    *   Create a GitHub Release for tag `v1.2.0`.
    *   Upload **both** `.zip` files from the `dist/` directory.
    *   Push the Docker image to GHCR:
        ```bash
        ./deploy/push_registry.sh 1.2.0
        ```
