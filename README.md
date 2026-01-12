# NodeGuarder

NodeGuarder is a lightweight server monitoring solution for Linux servers.

## Features

- **Real-time Monitoring**: CPU, Memory, Disk, and Load averages.
- **Drift Detection**: Tracks changes to system files (`/etc`, `/bin`, etc.) and alerts on modifications.
- **Cron Monitoring**: Auto-discovers and monitors cron jobs, alerting on failures.
- **Agent Architecture**: Lightweight Go agent that pushes data to a centralized dashboard.
- **Modern Dashboard**: React/Vite frontend for visualizing infrastructure health.

## Installation

### 1. Prerequisites
- Docker and Docker Compose
- Linux servers to monitor

### 2. Backend & Dashboard Setup

You can install NodeGuarder using our pre-built Docker images, either via our Registry or an Offline Package.

#### Option A: Online Installation (Recommended)
1.  Pull the image from our registry:
    ```bash
    docker pull ghcr.io/nodeguarder/nodeguarder:1.0.0
    ```
2.  Use the `deploy/docker-compose.customer.yml` template (rename to `docker-compose.yml`) and run:
    ```bash
    docker compose up -d
    ```

#### Option B: Offline Installation (Air-Gapped)
1.  Download the **Offline Package** (`nodeguarder-offline-vX.X.X.zip`) from our [GitHub Releases](https://github.com/nodeguarder/nodeguarder/releases).
2.  Unzip the package on your server.
3.  Load the docker image:
    ```bash
    docker load -i nodeguarder-1.0.0.tar
    ```
4.  Start the services:
    ```bash
    docker compose up -d
    ```

#### Accessing the Dashboard
- **URL**: `https://localhost:8443`
- **Default User**: `admin`
- **Default Password**: `change-me-immediately` (See docker-compose.yml to configure)

### 3. Agent Installation

Download the agent binary from your dashboard or build it manually:

```bash
cd agent
go build -o nodeguarder-agent .
./nodeguarder-agent --connect https://your-dashboard-url --token <REGISTRATION_TOKEN>
```

## Security & Licensing

### License
This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for details.

### Third-Party Software
This project uses the following open-source libraries:
- **Backend**: `gofiber/fiber`, `golang-jwt/jwt`, `mattn/go-sqlite3`
- **Frontend**: `react`, `vite`, `recharts`, `lucide-react`, `axios`

All third-party dependencies are permissive (MIT, Apache 2.0, or BSD) and are commercially friendly.

### Disclaimer of Liability
**THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED.**

By using this software, you agree that the authors and copyright holders shall **NOT** be liable for any claim, damages, or other liability, whether in an action of contract, tort, or otherwise, arising from, out of, or in connection with the software or the use or other dealings in the software.

**You are solely responsible for:**
1.  Verifying the security of your deployment.
2.  Managing your own data backups and retention.
3.  Ensuring compliance with your local regulations (e.g., GDPR).

The authors assume no responsibility for data loss, system instability, or security breaches resulting from the use of this software.
