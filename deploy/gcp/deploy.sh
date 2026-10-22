#!/usr/bin/env bash
# Builds and deploys Household OS to Cloud Run, then (re)creates the reminder schedule.
#
#   PROJECT_ID=my-project VAPID_PUBLIC_KEY=... ./deploy/gcp/deploy.sh
#
# Optional AI on Azure:
#   AI_PROVIDER=foundry ANTHROPIC_FOUNDRY_RESOURCE=my-resource AI_MODEL=claude-opus-5-5
#   AI_PROVIDER=azure-openai AZURE_OPENAI_ENDPOINT=https://x.openai.azure.com AZURE_OPENAI_DEPLOYMENT=gpt
# (store the API key first: setup.sh with ANTHROPIC_FOUNDRY_API_KEY / AZURE_OPENAI_API_KEY set)
set -euo pipefail

: "${PROJECT_ID:?Set PROJECT_ID}"
: "${VAPID_PUBLIC_KEY:?Set VAPID_PUBLIC_KEY (printed by setup.sh)}"
REGION="${REGION:-northamerica-northeast1}"
SERVICE="${SERVICE:-household-os}"
BUCKET="${BUCKET:-${PROJECT_ID}-${SERVICE}}"
RUN_SA="${SERVICE}-run@${PROJECT_ID}.iam.gserviceaccount.com"
VAPID_SUBJECT="${VAPID_SUBJECT:-mailto:admin@example.com}"
SCHEDULE="${SCHEDULE:-*/15 * * * *}"

cd "$(dirname "$0")/../.."
gcloud config set project "$PROJECT_ID" >/dev/null

ENV_VARS="NODE_ENV=production,GCS_BUCKET=${BUCKET},VAPID_PUBLIC_KEY=${VAPID_PUBLIC_KEY},VAPID_SUBJECT=${VAPID_SUBJECT}"
SECRETS="VAPID_PRIVATE_KEY=${SERVICE}-vapid-private-key:latest,CRON_SECRET=${SERVICE}-cron-secret:latest"
[[ -n "${APP_ORIGIN:-}" ]] && ENV_VARS+=",APP_ORIGIN=${APP_ORIGIN}"

case "${AI_PROVIDER:-none}" in
  foundry)
    : "${ANTHROPIC_FOUNDRY_RESOURCE:?Set ANTHROPIC_FOUNDRY_RESOURCE}"
    ENV_VARS+=",AI_PROVIDER=foundry,ANTHROPIC_FOUNDRY_RESOURCE=${ANTHROPIC_FOUNDRY_RESOURCE},AI_MODEL=${AI_MODEL:-claude-opus-5-5}"
    [[ -n "${AI_FALLBACK_MODEL:-}" ]] && ENV_VARS+=",AI_FALLBACK_MODEL=${AI_FALLBACK_MODEL}"
    SECRETS+=",ANTHROPIC_FOUNDRY_API_KEY=${SERVICE}-foundry-api-key:latest"
    ;;
  azure-openai)
    : "${AZURE_OPENAI_ENDPOINT:?Set AZURE_OPENAI_ENDPOINT}" "${AZURE_OPENAI_DEPLOYMENT:?Set AZURE_OPENAI_DEPLOYMENT}"
    ENV_VARS+=",AI_PROVIDER=azure-openai,AZURE_OPENAI_ENDPOINT=${AZURE_OPENAI_ENDPOINT},AZURE_OPENAI_DEPLOYMENT=${AZURE_OPENAI_DEPLOYMENT}"
    SECRETS+=",AZURE_OPENAI_API_KEY=${SERVICE}-azure-openai-api-key:latest"
    ;;
  none) ENV_VARS+=",AI_PROVIDER=none" ;;
  *) echo "AI_PROVIDER must be foundry, azure-openai or none" >&2; exit 1 ;;
esac

# One instance at most: SQLite has a single writer and snapshots go to Cloud Storage after
# every change. Scale-to-zero keeps it inside the free tier for a two-person household.
gcloud run deploy "$SERVICE" \
  --source . \
  --region "$REGION" \
  --service-account "$RUN_SA" \
  --allow-unauthenticated \
  --min-instances 0 \
  --max-instances 1 \
  --concurrency 40 \
  --cpu 1 \
  --memory 512Mi \
  --timeout 60 \
  --set-env-vars "$ENV_VARS" \
  --set-secrets "$SECRETS"

URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --format 'value(status.url)')"
CRON_SECRET="$(gcloud secrets versions access latest --secret "${SERVICE}-cron-secret")"

JOB="${SERVICE}-reminders"
ARGS=(--location "$REGION" --schedule "$SCHEDULE" --time-zone "Etc/UTC"
  --uri "${URL}/api/cron/reminders" --http-method POST
  --attempt-deadline 60s)
if gcloud scheduler jobs describe "$JOB" --location "$REGION" >/dev/null 2>&1; then
  gcloud scheduler jobs update http "$JOB" "${ARGS[@]}" --update-headers "X-Cron-Secret=${CRON_SECRET}"
else
  gcloud scheduler jobs create http "$JOB" "${ARGS[@]}" --headers "X-Cron-Secret=${CRON_SECRET}"
fi

printf '\n\033[1mDeployed:\033[0m %s\n' "$URL"
echo "Open it on each iPhone in Safari → Share → Add to Home Screen, then turn on notifications in Settings."
