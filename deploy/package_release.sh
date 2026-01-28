#!/bin/bash
# script to package the release for GitHub
# Usage: ./package_release.sh <version> [--offline]

VERSION=$1
OFFLINE=$2

if [ -z "$VERSION" ]; then
    echo "Usage: ./package_release.sh <version> [--offline]"
    exit 1
fi

PACKAGE_NAME="nodeguarder-deploy"
if [ "$OFFLINE" == "--offline" ]; then
    PACKAGE_NAME="nodeguarder-offline"
    echo "📦 Packaging OFFLINE release for version $VERSION..."
else
    echo "📦 Packaging deployment config for version $VERSION..."
fi

# Create temp dir
mkdir -p dist
rm -rf "dist/$PACKAGE_NAME"
mkdir -p "dist/$PACKAGE_NAME"

# Copy files
cp docker-compose.customer.yml "dist/$PACKAGE_NAME/docker-compose.yml"
cp nginx.conf "dist/$PACKAGE_NAME/"
cp license.yaml.example "dist/$PACKAGE_NAME/license.yaml.example"

# Create empty license.yaml so Docker doesn't create a directory
touch "dist/$PACKAGE_NAME/license.yaml"

# Generate default certs for the release package so it works out-of-the-box
mkdir -p "dist/$PACKAGE_NAME/certs"
openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
    -keyout "dist/$PACKAGE_NAME/certs/key.pem" \
    -out "dist/$PACKAGE_NAME/certs/cert.pem" \
    -subj "/CN=localhost/O=NodeGuarder/C=US" 2>/dev/null


# Logic for Offline Package
if [ "$OFFLINE" == "--offline" ]; then
    IMAGE_FILE="nodeguarder-$VERSION.tar"
    
    echo "💾 Exporting Docker Image..."
    if ! docker image inspect nodeguarder:$VERSION >/dev/null 2>&1; then
        echo "❌ Error: Image nodeguarder:$VERSION not found locally."
        echo "   Please run: ./build-images.sh $VERSION"
        exit 1
    fi
    
    docker save -o "dist/$PACKAGE_NAME/$IMAGE_FILE" "nodeguarder:$VERSION"
    
    # Create README
    cat > "dist/$PACKAGE_NAME/README.txt" <<EOF
NodeGuarder v$VERSION - Offline Installation
========================================

1. Load Docker Image:
   docker load -i $IMAGE_FILE

2. Install License:
   Copy your license file to 'license.yaml' in this directory.

3. Start NodeGuarder:
   docker compose up -d

4. Access Dashboard:
   https://localhost:8443
   Default User: admin
   Default Pass: change-me-immediately (See docker-compose.yml)
EOF

else
    # Online Package README
    cat > "dist/$PACKAGE_NAME/README.txt" <<EOF
NodeGuarder v$VERSION - Deployment
================================

1. Start NodeGuarder:
   docker compose up -d

2. Access Dashboard:
   https://localhost:8443
EOF
fi

# Zip it
cd dist
zip -r "${PACKAGE_NAME}-${VERSION}.zip" "$PACKAGE_NAME"
cd ..

echo "✅ Created dist/${PACKAGE_NAME}-${VERSION}.zip"
if [ "$OFFLINE" == "--offline" ]; then
    echo "   (This is the OFFLINE package containing the Docker image)"
fi
