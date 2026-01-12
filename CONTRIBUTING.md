# Contributing to NodeGuarder

Thank you for your interest in contributing to NodeGuarder! This document will help you get started with the development environment.

## 🚀 Quick Start

The easiest way to get the full stack running locally (Backend + Frontend + Database) is using our helper scripts. These scripts handle certificate generation, database setup, and Docker Compose execution.

### Windows (PowerShell)
```powershell
cd deploy
.\deploy.ps1
```

### Linux / macOS (Bash)
```bash
cd deploy
./deploy.sh
```

**These scripts will:**
1.  Check for Docker and Docker Compose.
2.  Generate self-signed SSL certificates for `localhost`.
3.  Create necessary data directories.
4.  Build the application from source (`deploy/Dockerfile`).
5.  Start the services at **https://localhost:8443**.

## 🛠️ Development Workflow

1.  **Backend**: Located in `dashboard/backend`. Written in Go (Fiber).
    *   To enable the License Generator locally, the `deploy/docker-compose.yml` mounts your local `deploy/license_tool/private.key`.
2.  **Frontend**: Located in `dashboard/frontend`. Written in React (Vite).
    *   Changes to frontend code will require a rebuild of the container unless you run the frontend separately with `npm run dev`.
3.  **Agent**: Located in `agent/`. Written in Go (eBPF).

## 🧪 Testing

We have a comprehensive test suite that runs in WSL/Linux:
```bash
cd tests
./wsl_test.sh
```

## 📝 Submitting Changes

1.  Fork the repository.
2.  Create a feature branch (`git checkout -b feature/amazing-feature`).
3.  Commit your changes.
4.  Push to the branch.
5.  Open a Pull Request.

Please ensure your code passes linting and existing tests before submitting.
