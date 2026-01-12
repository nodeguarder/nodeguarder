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

### 2. Backend & Dashboard Setup (On-Premise)

We provide helper scripts to get you up and running quickly with Docker Compose.

**Linux / macOS:**
```bash
cd deploy
./deploy.sh
```

**Windows (PowerShell):**
```powershell
cd deploy
.\deploy.ps1
```

These scripts will handling the building, certificate generation, and starting of the services.

- **URL**: `https://localhost:8443`
- **Default User**: `admin`
- **Default Password**: `admin` (You will be forced to change this on first login)

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

### ⚠️ Disclaimer of Liability
**THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED.**

By using this software, you agree that the authors and copyright holders shall **NOT** be liable for any claim, damages, or other liability, whether in an action of contract, tort, or otherwise, arising from, out of, or in connection with the software or the use or other dealings in the software.

**You are solely responsible for:**
1.  Verifying the security of your deployment.
2.  Managing your own data backups and retention.
3.  Ensuring compliance with your local regulations (e.g., GDPR).

The authors assume no responsibility for data loss, system instability, or security breaches resulting from the use of this software.
