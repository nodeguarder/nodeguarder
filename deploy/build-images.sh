#!/bin/bash

# Build script for NodeGuarder
# Creates both developer and customer Docker images

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default version
VERSION="${1:-1.0.1}"

echo -e "${BLUE}🔨 Building NodeGuarder Docker Images${NC}"
echo -e "${BLUE}================================================${NC}"
echo "Version: $VERSION"
echo ""

# Get directory where script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( dirname "$SCRIPT_DIR" )"

cd "$PROJECT_ROOT"

# 1. Build NodeGuarder Image
echo -e "${YELLOW}📦 Building NodeGuarder Image${NC}"
docker build \
    -f deploy/Dockerfile \
    -t nodeguarder:latest \
    -t "nodeguarder:$VERSION" \
    . || { echo -e "${RED}❌ Image build failed${NC}"; exit 1; }
echo -e "${GREEN}✅ Image built successfully${NC}"
echo ""

# 2. Verify images
echo -e "${BLUE}🔍 Verifying built images${NC}"
echo ""
docker images | grep -E "nodeguarder"

echo ""
echo -e "${GREEN}✅ All images built successfully!${NC}"
echo ""
echo -e "${BLUE}Quick Reference:${NC}"
echo "  Image:   nodeguarder:$VERSION"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "  1. Run: docker run -it -p 8080:8080 nodeguarder:$VERSION"
echo "  2. For customers, push customer image to registry:"
echo "     docker tag nodeguarder:$VERSION your-registry.com/nodeguarder:$VERSION"
echo "     docker push your-registry.com/nodeguarder:$VERSION"
echo ""
