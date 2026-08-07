#!/usr/bin/env bash
# Deploy Edge Functions using gitignored supabase/.env.local (never commit tokens).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/supabase/.env.local"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE — copy supabase/.env.local.example and set SUPABASE_ACCESS_TOKEN." >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo "SUPABASE_ACCESS_TOKEN is empty in supabase/.env.local" >&2
  exit 1
fi

PROJECT_REF="${SUPABASE_PROJECT_REF:-gqpafbmlherrwuigsjxy}"
FUNCTIONS=("$@")
if [[ ${#FUNCTIONS[@]} -eq 0 ]]; then
  FUNCTIONS=(extract-receipt)
fi

cd "$ROOT"
for fn in "${FUNCTIONS[@]}"; do
  echo "Deploying function: $fn → $PROJECT_REF"
  npx --yes supabase functions deploy "$fn" --project-ref "$PROJECT_REF" --use-api
done

echo "Done."
