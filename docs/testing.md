# Comprehensive Testing Guide

This guide ensures a smooth testing process for NodeGuarder, avoiding common pitfalls like build failures and quoting errors.

## 1. Prerequisites
- **Docker & Docker Compose** installed.
- **Git Bash (Windows)** or **Terminal (Linux/Mac)**.
- **Go 1.21+** (if building locally).

---

## 2. Building the Project
Always build using the provided script to ensure keys and permissions are set correctly.

```bash
cd deploy
./build-images.sh 1.0.0
cd deploy
./build-images.sh 1.0.0
```

## 2a. Comprehensive WSL Testing (`wsl_test.sh`)
For Windows developers using WSL, the `tests/wsl_test.sh` script is the primary end-to-end integration test suite. It runs a full battery of tests against the local environment.

```powershell
# From PowerShell (at project root)
wsl ./tests/wsl_test.sh
```

**What it tests:**
1.  **Dependencies**: Checks for required tools (`jq`) and ensures `rsyslog` is configured.
2.  **Authentication**: Automatically logs in and retrieves registration tokens.
3.  **Installation**: 
    -   Uses a locally built binary (via `deploy/agent-binaries`) if available, or downloads it.
    -   Generates a `config.yaml` with a fast interval (10s) for rapid testing.
4.  **Registration**: Registers the agent explicitly with the backend.
5.  **Advanced Configuration Sync**:
    -   **Drift**: Verifies custom drift paths (e.g., `/tmp/nodeguarder_custom`) and ignore patterns (`*.ignore`).
    -   **Health**: Verifies enabling/disabling health monitoring via the dashboard correctly stops/starts alerts.
6.  **Cron Monitoring (eBPF / Zero Touch)**:
    -   **Auto-Discovery**: Verifies that cron jobs are discovered from logs without manual configuration.
    -   **Failure Detection (Zero Touch)**: Simulates job failure (`/bin/ls /nonexistent`) and verifies eBPF detects the exit code directly.
    -   **Timeouts**: Simulates long-running jobs using `sleep` and verifies timeout alert.
    -   **Ignore Codes**: Verifies that specific exit codes (e.g. 1) are ignored if configured.
7.  **Offline Detection**: Kills the agent process and asserts the server status becomes "offline" on the dashboard.

**Requirements:**
*   A running WSL distribution (Ubuntu recommended).
*   **Rsyslog** installed (`sudo apt install rsyslog`) for Cron monitoring tests.
*   The backend/dashboard running locally (`http://localhost:8081`).
*   Configured `ADMIN_PASSWORD` (defaults to 'admin').

**Usage:**
```bash
# Ensure you are in the tests directory
cd tests
wsl bash -c "ADMIN_PASSWORD='admin' ./wsl_test.sh"
```

---

## 3. Running the Stack
Start the environment with the Developer configuration (includes License Generator):

```bash
cd deploy
docker-compose up -d --build
```
- Dashboard: https://localhost:8443 (or http://localhost:8081 if strictly backend)
- Admin User: `admin`
- Admin Password: `admin` (or defined by `ADMIN_PASSWORD` env var). Note: Force change on first login.

---

## 4. Robust Verification (Inside Docker)
The most reliable way to test APIs involves running a script **inside** the container to avoid host firewall/network issues and shell quoting problems (especially on Windows).

### Step 1: Use the Robust Verification Script
We have created a robust script, `tests/verify_full.sh`, that replicates the full test suite (Binary Download → Run → Verify Metrics) but is designed to run reliably inside the container.

```bash
# 1. Copy script to container
docker cp tests/verify_full.sh health-dashboard-backend:/app/verify_full.sh

# 2. Run it (auto-installs curl/bash if needed)
docker exec health-dashboard-backend sh /app/verify_full.sh
```

This script performs:
1.  **Authentication**: Gets Admin & Registration Tokens.
2.  **Download**: Fetches the agent binary from `localhost`.
3.  **Execution**: Runs the agent in the background.
4.  **Verification**: Confirms the agent sends metrics to the dashboard.



### Step 2: Configuration & Regression Tests
We have updated `tests/regression_tests.sh` to include verification for:
1.  **Centralized Configuration**:
    -   Pushes a config ignoring `*.drift_ignore`.
    -   Creates a matching file and asserts **NO** drift event is generated.
2.  **Cron Ignore**:
    -   Configures ignore for exit code 42.
    -   Injects a log with code 42 and asserts **NO** failure event.
3.  **Offline Timeout**:
    -   Sets timeout to 5 seconds.
    -   Kills the agent and verifies `health_status` becomes `offline` after 8 seconds.

```bash
docker cp tests/regression_tests.sh health-dashboard-backend:/app/regression_tests.sh
docker exec health-dashboard-backend sh /app/regression_tests.sh
```

### Configuration Refresh Behavior
The Agent fetches configuration updates (thresholds, ignore patterns, timeouts) at the same interval as metrics collection (`interval` in `config.yaml`, default 60s).
- **Production**: Updates are applied within `interval` seconds (e.g., 60s).
- **Tests**: The regression test sets `interval: 5` to speed up verification.

### Known Issues
- **Test Environment Timing**: In the Docker-based regression test environment, the Agent's main loop has been observed to run every ~60 seconds despite the `interval: 5` configuration. This is likely an environmental artifact (e.g., clock/tick alignment in the minimal container). Tests include extended `sleep 70` delays to accommodate this. This does **not** affect production usage where the default 60s interval is expected.

## 5. Troubleshooting Common Issues

### "Unrecognized token" / "ParserError"
- **Cause**: Windows PowerShell trying to parse JSON quotes in `curl` commands.
- **Fix**: Write your JSON to a file (`data.json`) and use `curl -d @data.json`.

### "Build Failed: imported and not used"
- **Cause**: You edited a Go file and left an unused import.
- **Fix**: Open the file mentioned in the error and delete the unused import line.

### "Connection Refused"
- **Cause**: The container isn't running or isn't healthy.
- **Fix**: Run `docker logs health-dashboard-backend` to see why it crashed (often a DB permission or missing key issue).
