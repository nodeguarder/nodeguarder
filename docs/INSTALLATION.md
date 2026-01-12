# Installation Guide

This guide covers the installation of the NodeGuarder dashboard and agents.

## Table of Contents
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Dashboard Deployment](#dashboard-deployment)
- [Agent Installation](#agent-installation)
- [Licensing](#licensing)

## Prerequisites
- **Hardware**: 1 CPU, 512MB RAM (Minimum)
- **Software**: Docker Engine 20.10+, Docker Compose v2+
- **Network**: Port 80, 443 (for HTTPS), or 8080 (for dev/HTTP)

---

## Quick Start

### 1. Deploy the Dashboard
```bash
# 1. Get the deployment files
git clone https://github.com/yourusername/health-dashboard.git
cd health-dashboard/deploy

# 2. Start services (Dev/HTTP)
docker compose up -d
```
Access: `http://localhost:8080` (User: `admin`, Password: `admin` -> force change)

---

## Dashboard Deployment

### Customer / Production Deployment (HTTPS)
For production environments, we utilize Nginx for HTTPS termination.

1.  **Prepare Directory**:
    ```bash
    mkdir health-dashboard
    cd health-dashboard
    # Copy docker-compose.customer.yml as docker-compose.yml
    cp /path/to/deploy/docker-compose.customer.yml docker-compose.yml
    # Copy nginx.customer.conf
    cp /path/to/deploy/nginx.customer.conf nginx.customer.conf
    ```

2.  **Generate/Place Certificates**:
    Place your valid SSL certificates in a `certs/` directory:
    - `certs/cert.pem`
    - `certs/key.pem`
    *(The deployment script can generate self-signed ones if needed)*

3.  **Start Services**:
    ```bash
    docker compose up -d
    ```

4.  **Access**: `https://your-domain.com:8443` (or port 443 if configured)

### Installing a Paid License
If you purchased a Standard or Pro license:
1.  You received a `license.yaml` file.
2.  Place it in the deployment directory (next to `docker-compose.yml`).
3.  Restart the backend:
    ```bash
    docker compose restart app
    ```
4.  Verify the license in **Settings > License**.

---

## Agent Installation

You can install agents using the **One-Line Installer** (best for most users) or by **Manually Downloading** the binary.

### Method 1: One-Line Installer (Recommended)
1.  Log in to the Dashboard.
2.  Go to **Distribute Agent** via the sidebar.
3.  Copy the provided command. It looks like this:
    ```bash
    curl -sfL https://your-dashboard.com/api/v1/agent/package/bash?token=YOUR_TOKEN | sudo bash -s -- --dashboard-url https://your-dashboard.com
    ```
    *Note: The `--dashboard-url` flag ensures the agent connects back to the correct address.*

### Method 2: Manual Binary Download
1.  Go to **Distribute Agent** in the dashboard.
2.  Click **Download Binary** for your architecture (AMD64 or ARM64).
3.  Transfer the binary to your server.
4.  Create a `config.yaml`:
    ```yaml
    server_id: "server-unique-id"
    api_secret: "generated-secret"
    dashboard_url: "https://your-dashboard.com"
    registration_token: "YOUR_TOKEN"
    ```
5.  Run: `./nodeguarder-agent --config config.yaml`

---

## Licensing
The system comes with a **Free License** (5 servers) out of the box. 
To monitor more servers, contact sales to obtain a `license.yaml` file for Standard (20) or Pro (50) tiers.
