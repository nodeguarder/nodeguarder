#!/bin/bash

# Script to bump version across the entire project
NEW_VERSION=$1

if [ -z "$NEW_VERSION" ]; then
    echo "Usage: ./bump-version.sh <new_version>"
    echo "Example: ./bump-version.sh 1.0.1"
    exit 1
fi

echo "🚀 Bumping version to $NEW_VERSION..."

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( dirname "$SCRIPT_DIR" )"

# Helper function for sed compatibility (macOS vs Linux)
sedi() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "$@"
    else
        sed -i "$@"
    fi
}

# 1. Update Agent (agent/main.go)
AGENT_FILE="$PROJECT_ROOT/agent/main.go"
echo "👉 Updating Agent ($AGENT_FILE)..."
sedi "s/var Version = \".*\"/var Version = \"$NEW_VERSION\"/" "$AGENT_FILE"

# 2. Update Frontend (dashboard/frontend/package.json)
FRONTEND_FILE="$PROJECT_ROOT/dashboard/frontend/package.json"
echo "👉 Updating Frontend ($FRONTEND_FILE)..."
# Use sed to find "version": "..." and replace it. Limit to top lines to avoid dependencies.
# This assumes "version" is near the top of package.json
sedi "0,/\s*\"version\":/s/\"version\": \".*\"/\"version\": \"$NEW_VERSION\"/" "$FRONTEND_FILE"

# 3. Update Build Script (deploy/build-images.sh)
BUILD_SCRIPT="$PROJECT_ROOT/deploy/build-images.sh"
echo "👉 Updating Build Script ($BUILD_SCRIPT)..."
sedi "s/VERSION=\"\${1:-.*}\"/VERSION=\"\${1:-$NEW_VERSION}\"/" "$BUILD_SCRIPT"

# 4. Update Docker Compose (deploy/docker-compose.yml)
COMPOSE_FILE="$PROJECT_ROOT/deploy/docker-compose.yml"
echo "👉 Updating Docker Compose ($COMPOSE_FILE)..."
sedi "s/VERSION=\${VERSION:-.*}/VERSION=\${VERSION:-$NEW_VERSION}/" "$COMPOSE_FILE"

# 5. Update Customer Docker Compose (deploy/docker-compose.customer.yml)
CUSTOMER_COMPOSE="$PROJECT_ROOT/deploy/docker-compose.customer.yml"
echo "👉 Updating Customer Compose ($CUSTOMER_COMPOSE)..."
sedi "s/image: nodeguarder:.*/image: nodeguarder:$NEW_VERSION/" "$CUSTOMER_COMPOSE"

echo ""
echo "✅ Version bumped to $NEW_VERSION successfully!"
echo ""
echo "Next steps:"
echo "  1. git commit -am \"Bump version to $NEW_VERSION\""
echo "  2. ./deploy/build-images.sh $NEW_VERSION"
echo "  3. ./deploy/package_release.sh $NEW_VERSION"
