#!/usr/bin/env bash
#
# Render an env file from AWS SSM Parameter Store.
#
# Each param under ${SSM_PREFIX} becomes a KEY=value line (param name basename =
# env var name). Written to a temp file and moved into place atomically so
# readers never see a half-written file. Refuses to overwrite the target with an
# empty render (e.g. wrong prefix or a broken IAM change).
#
# Called by deploy/deploy.sh on every deploy, and can be run standalone on the
# host to refresh config without a full rebuild:
#
#   ./deploy/render-env.sh
#   docker compose -f docker-compose.prod.yml up -d   # restart to pick it up
#
# Overridable via env vars:
#   AWS_REGION   AWS region                     (default: ap-south-1)
#   SSM_PREFIX   SSM path prefix, trailing '/'  (default: /recruit-ai/prod/)
#   OUTPUT       target env file path           (default: .env.prod, cwd-relative)

set -euo pipefail

AWS_REGION="${AWS_REGION:-ap-south-1}"
SSM_PREFIX="${SSM_PREFIX:-/recruit-ai/prod/}"
OUTPUT="${OUTPUT:-.env.prod}"

echo "==> Rendering ${OUTPUT} from SSM Parameter Store (${SSM_PREFIX})"
TMP_ENV="$(mktemp)"
trap 'rm -f "${TMP_ENV}"' EXIT

# --output text is tab-separated, so '=' inside a value is safe. CLI v2
# auto-paginates get-parameters-by-path, so no manual NextToken loop is needed.
aws ssm get-parameters-by-path \
  --region "${AWS_REGION}" \
  --path "${SSM_PREFIX}" \
  --recursive \
  --with-decryption \
  --query "Parameters[].[Name,Value]" \
  --output text | \
  while IFS=$'\t' read -r name value; do
    printf '%s=%s\n' "${name#"${SSM_PREFIX}"}" "${value}"
  done > "${TMP_ENV}"

# Refuse to write an empty env file (e.g. wrong prefix or a broken IAM change)
# rather than overwriting a working one with nothing.
if [ ! -s "${TMP_ENV}" ]; then
  echo "ERROR: rendered ${OUTPUT} is empty; refusing to overwrite it" >&2
  exit 1
fi

chmod 600 "${TMP_ENV}"
mv "${TMP_ENV}" "${OUTPUT}"
trap - EXIT
echo "==> Wrote ${OUTPUT} ($(wc -l < "${OUTPUT}") keys)"
