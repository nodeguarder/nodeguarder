# Health Dashboard Deployment Script for Windows
# Run with: powershell -ExecutionPolicy Bypass -File deploy.ps1

Write-Host "NodeGuarder Deployment" -ForegroundColor Cyan
Write-Host "======================" -ForegroundColor Cyan
Write-Host ""

# Check for Docker
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "Error: Docker is required but not installed." -ForegroundColor Red
    Write-Host "Download from: https://www.docker.com/products/docker-desktop" -ForegroundColor Yellow
    exit 1
}

# Check for Docker Compose
if (-not (Get-Command docker-compose -ErrorAction SilentlyContinue)) {
    Write-Host "Error: Docker Compose is required but not installed." -ForegroundColor Red
    exit 1
}

# Create necessary directories
New-Item -ItemType Directory -Force -Path "data" | Out-Null
New-Item -ItemType Directory -Force -Path "certs" | Out-Null

# Check for TLS certificates
if (-not (Test-Path "certs\cert.pem") -or -not (Test-Path "certs\key.pem")) {
    Write-Host "TLS certificates not found. Generating self-signed certificate..." -ForegroundColor Yellow
    
    # Check if OpenSSL is available
    if (Get-Command openssl -ErrorAction SilentlyContinue) {
        openssl req -x509 -nodes -days 365 -newkey rsa:2048 `
            -keyout certs\key.pem -out certs\cert.pem `
            -subj "/CN=localhost/O=HealthDashboard/C=US" 2>$null
        Write-Host "Self-signed certificate generated" -ForegroundColor Green
    } else {
        Write-Host "OpenSSL not found. Using fallback generator..." -ForegroundColor Yellow
        # Generate valid self-signed certs using pre-generated keys or .NET
        .\generate_certs_fallback.ps1
    }
}

# Check for license file
# Check for license file
if (-not (Test-Path "license.yaml")) {
    Write-Host "License file not found. Creating empty placeholder (defaults to Free Tier)." -ForegroundColor Yellow
    New-Item -Path "license.yaml" -ItemType File | Out-Null
}

# Build and start containers
Write-Host ""
Write-Host "Building containers..." -ForegroundColor Cyan
docker-compose build

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Starting services..." -ForegroundColor Cyan
docker-compose up -d

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to start services!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "NodeGuarder deployed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Access the dashboard at:" -ForegroundColor Cyan
Write-Host "  HTTPS: https://localhost:8443" -ForegroundColor White
Write-Host "  HTTP:  http://localhost:8080 (redirects to HTTPS)" -ForegroundColor White
Write-Host ""
Write-Host "Default credentials:" -ForegroundColor Cyan
Write-Host "  Username: admin" -ForegroundColor White
Write-Host "  Password: admin" -ForegroundColor White
Write-Host ""
Write-Host "Useful commands:" -ForegroundColor Cyan
Write-Host "  View logs:     docker-compose logs -f" -ForegroundColor White
Write-Host "  Stop services: docker-compose down" -ForegroundColor White
Write-Host "  Restart:       docker-compose restart" -ForegroundColor White
