#!/usr/bin/env bash
#
# Production deploy for the recruit-ai backend.
#
# Renders .env.prod from SSM Parameter Store, builds images, applies DB
# migrations, then swaps the running containers. Run on the EC2 host as the
# deploy user (ssm-user), either by hand or via the "Deploy to EC2" GitHub
# Actions workflow.
#
# This script does NOT update the git checkout. The deploy workflow fetches and
# checks out the requested ref BEFORE invoking this script, so that changes to
# this script take effect on the same deploy that ships them. For a manual host
# run, check out the ref yourself first (e.g. `git checkout <ref> && git pull`).
#
# Usage:
#   ./deploy/deploy.sh [ref]     # ref defaults to "main"; used only for logging/args
#
# .env.prod is regenerated on every deploy from the SSM params under
# /recruit-ai/prod/ (see below), so config changes never require editing the
# host over SSH. Does NOT touch the certbot-managed nginx/TLS config.

set -euo pipefail

REF="${1:-main}"
AWS_REGION="${AWS_REGION:-ap-south-1}"
SSM_PREFIX="/recruit-ai/prod/"

# Resolve the backend dir (parent of this script's deploy/ dir) so the script
# works regardless of the caller's cwd.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="docker-compose.prod.yml"

cd "${BACKEND_DIR}"

echo "==> Deploying ref '${REF}' from ${BACKEND_DIR}"

# Regenerate .env.prod from SSM Parameter Store. Rendering lives in render-env.sh
# so it can also be run standalone on the host for a config-only refresh.
AWS_REGION="${AWS_REGION}" SSM_PREFIX="${SSM_PREFIX}" OUTPUT=".env.prod" \
  "${SCRIPT_DIR}/render-env.sh"

# Each build moves the api/worker/migrate tags to new images and leaves the
# previous ones dangling (<none>:<none>); Docker never removes them itself, so
# they pile up on the host's small root disk. Pruning before the build frees
# that space for the build that needs it. Dangling images are untagged, so
# nothing running uses them and the current stack stays up.
echo "==> Pruning dangling images"
docker image prune -f

# --profile tools is load-bearing: the `migrate` service sits in that profile,
# and a plain `build` skips it. `run --rm migrate` would then reuse a stale
# image from an earlier deploy and fail *silently* -- an old image computes an
# old alembic head, finds the DB already there, and exits 0 with no "Running
# upgrade" line -- swapping in new code against the old schema. The image is
# layer-identical to api's, so building it costs nothing.
echo "==> Building images"
docker compose -f "${COMPOSE_FILE}" --profile tools build

# Migrate before the swap so new code never serves against the old schema.
# A build or migration failure aborts here, with the old stack still up.
# Depends on the --profile tools build above having refreshed this image.
echo "==> Applying database migrations"
docker compose -f "${COMPOSE_FILE}" run --rm migrate

# --wait blocks until every service with a healthcheck reports healthy, so the
# script only returns once the new API is actually serving. Without it, `up -d`
# returns as soon as containers are *created* and the workflow's health check
# races a still-booting app.
echo "==> Starting containers"
if ! docker compose -f "${COMPOSE_FILE}" up -d --remove-orphans --wait --wait-timeout 180; then
  echo "ERROR: containers did not all report healthy (timeout 180s)" >&2
  echo "----- container status -----" >&2
  docker compose -f "${COMPOSE_FILE}" ps >&2 || true
  echo "----- recent logs -----" >&2
  docker compose -f "${COMPOSE_FILE}" logs --tail 50 >&2 || true
  exit 1
fi

echo "==> Deploy complete"
