#!/bin/bash

set -e

IMAGE_NAME="jtc-umami"
REGISTRY="cr.jamestown-capital.com/jtc"
TAG="latest"
FULL_IMAGE="${REGISTRY}/${IMAGE_NAME}:${TAG}"

echo "Building Docker image: ${IMAGE_NAME}:${TAG} (linux/amd64)"
docker build --platform linux/amd64 -t "${IMAGE_NAME}:${TAG}" -t "${FULL_IMAGE}" .

echo "Pushing image to ${FULL_IMAGE}"
docker push "${FULL_IMAGE}"

echo "Done!"
