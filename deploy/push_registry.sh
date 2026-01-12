#!/bin/bash
# Script to push NodeGuarder images to GitHub Container Registry

VERSION=$1
REGISTRY="ghcr.io"
ORG="nodeguarder"
REPO="nodeguarder"
IMAGE_NAME="$REGISTRY/$ORG/$REPO"

if [ -z "$VERSION" ]; then
    echo "Usage: ./push_registry.sh <version>"
    exit 1
fi

echo "🚀 Pushing NodeGuarder v$VERSION to $REGISTRY..."

# 1. Verify Login
if ! docker login ghcr.io >/dev/null 2>&1; then
    echo "⚠️  You are not logged in to ghcr.io."
    echo "   Please run: echo <CR_PAT> | docker login ghcr.io -u <USERNAME> --password-stdin"
    exit 1
fi

# 2. Check local image
LOCAL_IMAGE="nodeguarder:$VERSION"
if ! docker image inspect "$LOCAL_IMAGE" >/dev/null 2>&1; then
    echo "❌ Local image $LOCAL_IMAGE not found."
    echo "   Please run: ./build-images.sh $VERSION"
    exit 1
fi

# 3. Tag Images
echo "🏷️  Tagging images..."
docker tag "$LOCAL_IMAGE" "$IMAGE_NAME:$VERSION"
docker tag "$LOCAL_IMAGE" "$IMAGE_NAME:latest"

# 4. Push Images
echo "⬆️  Pushing to $IMAGE_NAME..."
docker push "$IMAGE_NAME:$VERSION"
docker push "$IMAGE_NAME:latest"

echo ""
echo "✅ Successfully pushed:"
echo "   - $IMAGE_NAME:$VERSION"
echo "   - $IMAGE_NAME:latest"
