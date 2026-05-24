#!/usr/bin/env bash
# NodeGuarder Enterprise Portal — one-liner install
# Usage: curl -fsSL https://nodeguarder.com/install-portal.sh | bash
set -euo pipefail

REPO_BASE="https://raw.githubusercontent.com/nodeguarder/nodeguarder/main/enterprise-portal"
INSTALL_DIR="${PORTAL_DIR:-nodeguarder-portal}"

echo "==> Creating $INSTALL_DIR..."
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

echo "==> Downloading production compose file..."
curl -sO "$REPO_BASE/docker-compose.prod.yml"

echo "==> Generating secrets..."
mkdir -p secrets
openssl rand -base64 32 > secrets/db_password.txt
openssl rand -base64 64 > secrets/jwt_secret.txt

echo "==> Pulling PostgreSQL (this may take a moment)..."
docker compose -f docker-compose.prod.yml pull postgres pgbouncer

echo "==> Starting NodeGuarder Portal..."
docker compose -f docker-compose.prod.yml up -d

echo ""
echo "✓ NodeGuarder Portal started!"
echo ""
echo "  API:      http://localhost:3000"
echo "  UI:       http://localhost:80"
echo "  gRPC:     localhost:50051"
echo ""
echo "  Default login:"
echo "    Email:    admin@nodeguarder.local"
echo "    Password: NodeGuarder#DM1n"
echo ""
echo "  IMPORTANT: Change the admin password after first login."
echo "  For production, place behind a TLS-terminating reverse proxy (Caddy, Traefik, nginx)."
echo ""
