#!/bin/bash
# script to package the release for GitHub

VERSION=$1

if [ -z "$VERSION" ]; then
    echo "Usage: ./package_release.sh <version>"
    exit 1
fi

echo "📦 Packaging release for version $VERSION..."

# Create temp dir
rm -rf dist
mkdir -p dist/nodeguarder-deploy

# Copy files
cp docker-compose.customer.yml dist/nodeguarder-deploy/docker-compose.yml
cp nginx.conf dist/nodeguarder-deploy/
cp license.yaml.example dist/nodeguarder-deploy/license.yaml.example

# Create empty license.yaml so Docker doesn't create a directory
touch dist/nodeguarder-deploy/license.yaml

# Generate default certs for the release package so it works out-of-the-box
mkdir -p dist/nodeguarder-deploy/certs
# Use the same logic as deploy.ps1 fallback to generate a valid long-term localhost cert
# actually, better to generate a fresh one here
openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
    -keyout dist/nodeguarder-deploy/certs/key.pem \
    -out dist/nodeguarder-deploy/certs/cert.pem \
    -subj "/CN=localhost/O=NodeGuarder/C=US" 2>/dev/null

# Zip it
cd dist
zip -r "nodeguarder-deploy-$VERSION.zip" nodeguarder-deploy
cd ..

echo "✅ Created dist/nodeguarder-deploy-$VERSION.zip"
echo "   Upload this file to your GitHub Release."
