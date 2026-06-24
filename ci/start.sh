#!/bin/bash
set -e
echo "Starting build workflow"

ci/docker_initialize.sh

# run build
DATESTAMP=$(date +%Y%m%d)
echo "[${BRANCH_NAME}] Building images: ${IMAGE_FULLNAME}"
if [ "$BRANCH_NAME" = "master" ] || [ "$BRANCH_NAME" = "main" ]
then
    docker build \
        -t ${IMAGE_FULLNAME}:${DATESTAMP} \
        -t ${IMAGE_FULLNAME}:latest \
        --pull \
        --push .
else
    docker build \
        -t ${IMAGE_FULLNAME}-test:${BRANCH_NAME}-${DATESTAMP} \
        --pull \
        --push .
fi

# cleanup
ci/docker_cleanup.sh
