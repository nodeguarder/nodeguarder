#!/bin/bash

set -e

echo "🚀 NodeGuarder Deployment"
echo "======================"
echo ""

# Check for required commands
command -v docker >/dev/null 2>&1 || { echo "Error: docker is required but not installed."; exit 1; }
command -v docker-compose >/dev/null 2>&1 || command -v docker compose >/dev/null 2>&1 || { echo "Error: docker-compose is required but not installed."; exit 1; }

# Create necessary directories
mkdir -p data certs

# Check for TLS certificates
if [ ! -f "certs/cert.pem" ] || [ ! -f "certs/key.pem" ]; then
    echo "⚠️  TLS certificates not found. Generating self-signed certificate..."
    
    if command -v openssl >/dev/null 2>&1; then
        # Use local OpenSSL
        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout certs/key.pem -out certs/cert.pem \
            -subj "/CN=localhost/O=NodeGuarder/C=US" \
            2>/dev/null
    else
        # Use Docker fallback
        echo "   (OpenSSL not found locally, using Docker...)"
        docker run --rm -v "$(pwd)/certs:/certs" alpine sh -c "apk add --no-cache openssl && openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout /certs/key.pem -out /certs/cert.pem -subj '/CN=localhost/O=NodeGuarder/C=US'"
    fi
    echo "✅ Self-signed certificate generated"
fi

# Check for license file
# Check for license file
if [ ! -f "license.yaml" ]; then
    echo "⚠️  License file not found. Creating empty placeholder (defaults to Free Tier)."
    touch license.yaml
fi

# Build and start containers
echo ""
echo "📦 Building containers..."
docker-compose build

echo ""
echo "🔄 Starting services..."
docker-compose up -d

echo ""
echo "✅ NodeGuarder deployed successfully!"
echo ""
echo "Access the dashboard at:"
echo "  HTTPS: https://localhost:8443"
echo "  HTTP:  http://localhost:8080 (redirects to HTTPS)"
echo ""
echo "Default credentials:"
echo "  Username: admin"
echo "  Password: admin"
echo ""
echo "View logs:"
echo "  docker-compose logs -f"
echo ""
echo "Stop services:"
echo "  docker-compose down"
