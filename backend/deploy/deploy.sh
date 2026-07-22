#!/usr/bin/env bash
#
# Production deploy for the recruit-ai backend.
#
# Pulls the requested ref, rebuilds the prod compose stack, and applies DB
# migrations. Run on the EC2 host as the deploy user (ssm-user), either by
# hand or via the "Deploy to EC2" GitHub Actions workflow.
#
# Usage:
#   ./deploy/deploy.sh [ref]     # ref defaults to "main"
#
# Does NOT touch .env.prod or the certbot-managed nginx/TLS config.

set -euo pipefail

REF="${1:-main}"

# Resolve the backend dir (parent of this script's deploy/ dir) so the script
# works regardless of the caller's cwd.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="docker-compose.prod.yml"

cd "${BACKEND_DIR}"

echo "==> Deploying ref '${REF}' from ${BACKEND_DIR}"

echo "==> Fetching and checking out ${REF}"
git fetch --all --prune
git checkout "${REF}"
git pull --ff-only origin "${REF}"

echo "==> Building and starting containers"
docker compose -f "${COMPOSE_FILE}" up -d --build

echo "==> Applying database migrations"
docker compose -f "${COMPOSE_FILE}" exec -T api uv run alembic upgrade head

echo "==> Deploy complete"
