#!/usr/bin/env bash
# One-time Google Cloud setup for Household OS. Safe to re-run.
#
#   PROJECT_ID=my-project REGION=northamerica-northeast1 ./deploy/gcp/setup.sh
#
# Creates: required APIs, a versioned Cloud Storage bucket for the SQLite snapshots, a runtime
# service account with access to that bucket only, and Secret Manager secrets for the VAPID
# private key and the cron secret (values are generated if you don't provide them).
set -euo pipefail

: "${PROJECT_ID:?Set PROJECT_ID}"
REGION="${REGION:-northamerica-northeast1}"
SERVICE="${SERVICE:-household-os}"
BUCKET="${BUCKET:-${PROJECT_ID}-${SERVICE}}"
RUN_SA_NAME="${SERVICE}-run"
RUN_SA="${RUN_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

log() { printf '\n\033[1m▸ %s\033[0m\n' "$*"; }

gcloud config set project "$PROJECT_ID" >/dev/null

log "Enabling APIs"
gcloud services enable \
  run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  secretmanager.googleapis.com cloudscheduler.googleapis.com storage.googleapis.com

log "Bucket gs://${BUCKET} (versioned; old versions pruned after 30 days)"
if ! gcloud storage buckets describe "gs://${BUCKET}" >/dev/null 2>&1; then
  gcloud storage buckets create "gs://${BUCKET}" --location="$REGION" --uniform-bucket-level-access
fi
gcloud storage buckets update "gs://${BUCKET}" --versioning
LIFECYCLE="$(mktemp)"
cat >"$LIFECYCLE" <<'JSON'
{ "rule": [ { "action": { "type": "Delete" }, "condition": { "isLive": false, "daysSinceNoncurrentTime": 30 } } ] }
JSON
gcloud storage buckets update "gs://${BUCKET}" --lifecycle-file="$LIFECYCLE"
rm -f "$LIFECYCLE"

log "Runtime service account ${RUN_SA}"
if ! gcloud iam service-accounts describe "$RUN_SA" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$RUN_SA_NAME" --display-name="Household OS (Cloud Run)"
fi
gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" \
  --member="serviceAccount:${RUN_SA}" --role="roles/storage.objectAdmin" >/dev/null

ensure_secret() {
  local name="$1" value="$2"
  if ! gcloud secrets describe "$name" >/dev/null 2>&1; then
    printf '%s' "$value" | gcloud secrets create "$name" --replication-policy=automatic --data-file=-
    echo "created secret ${name}"
  else
    echo "secret ${name} already exists (left unchanged)"
  fi
  gcloud secrets add-iam-policy-binding "$name" \
    --member="serviceAccount:${RUN_SA}" --role="roles/secretmanager.secretAccessor" >/dev/null
}

log "Secrets"
if [[ -z "${VAPID_PRIVATE_KEY:-}" || -z "${VAPID_PUBLIC_KEY:-}" ]]; then
  echo "Generating a VAPID key pair (npm run vapid)…"
  KEYS="$(node scripts/generate-vapid.mjs)"
  VAPID_PUBLIC_KEY="$(grep VAPID_PUBLIC_KEY <<<"$KEYS" | cut -d= -f2-)"
  VAPID_PRIVATE_KEY="$(grep VAPID_PRIVATE_KEY <<<"$KEYS" | cut -d= -f2-)"
fi
ensure_secret "${SERVICE}-vapid-private-key" "$VAPID_PRIVATE_KEY"
ensure_secret "${SERVICE}-cron-secret" "${CRON_SECRET:-$(openssl rand -base64 32 | tr -d '\n=+/')}"
if [[ -n "${ANTHROPIC_FOUNDRY_API_KEY:-}" ]]; then
  ensure_secret "${SERVICE}-foundry-api-key" "$ANTHROPIC_FOUNDRY_API_KEY"
fi
if [[ -n "${AZURE_OPENAI_API_KEY:-}" ]]; then
  ensure_secret "${SERVICE}-azure-openai-api-key" "$AZURE_OPENAI_API_KEY"
fi

log "Done"
cat <<EOF
Keep these for deploy.sh (the public key is not secret):
  export PROJECT_ID=${PROJECT_ID}
  export REGION=${REGION}
  export VAPID_PUBLIC_KEY=${VAPID_PUBLIC_KEY}
  export VAPID_SUBJECT=mailto:you@example.com

If a VAPID secret already existed, use the public key that matches it.
Next: ./deploy/gcp/deploy.sh
EOF
