# Quick Deployment Guide

## Windows Users

Run in PowerShell:
```powershell
cd deploy
powershell -ExecutionPolicy Bypass -File deploy.ps1
```

Or run Docker Compose directly:
```powershell
cd deploy

# Create directories
mkdir -Force data, certs

# Copy license
copy license.yaml.example license.yaml

# Build and start
docker-compose up -d
```

## Linux/macOS Users

```bash
cd deploy
chmod +x deploy.sh
./deploy.sh
```

## What Runs in Docker?

All services run in containers:

1. **Backend Container**
   - Go API server
   - Port: 8080 (internal)
   - Volume: `./data` (SQLite database)

2. **Frontend Container**
   - React app served by Nginx
   - Port: 3000 (internal)

3. **Nginx Container**
   - Reverse proxy
   - Ports: 8443 (HTTPS), 80 (HTTP redirect)
   - TLS termination

## Access

- Dashboard: https://localhost:8443
- Credentials: admin / admin

## Verify Deployment

```powershell
# Check running containers
docker-compose ps

# View logs
docker-compose logs -f

# Check specific service
docker-compose logs backend
```

## Stop Services

```powershell
docker-compose down

# Stop and remove volumes
docker-compose down -v
```
