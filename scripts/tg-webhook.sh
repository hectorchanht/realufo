#!/usr/bin/env bash
# Register the Telegram webhook: Telegram POSTs updates to https://realufo.org/__tg with the
# secret header. Needs TELEGRAM_BOT_TOKEN + TELEGRAM_WEBHOOK_SECRET in the repo-root .env (and as
# Worker secrets). Safe to re-run.
#
# Rollout checklist
#  - Worker secrets needed: TELEGRAM_BOT_TOKEN, TELEGRAM_OWNER_ID, TELEGRAM_WEBHOOK_SECRET.
#    Check with: npx wrangler secret list --env-file /dev/null
#  - FEATURE_X must be "on" together with FEATURE_GATE (wrangler.jsonc): an approved post can't go out while X is off.
#  - Run from the main checkout: it reads .env at the repo root, and a worktree has none.
set -euo pipefail
ROOT=$(git rev-parse --show-toplevel)
get() { grep -s "^$1=" "$ROOT/.env" | tail -1 | cut -d= -f2- || true; }
T=$(get TELEGRAM_BOT_TOKEN); S=$(get TELEGRAM_WEBHOOK_SECRET)
[ -n "$T" ] && [ -n "$S" ] || { echo "TELEGRAM_BOT_TOKEN / TELEGRAM_WEBHOOK_SECRET missing in .env"; exit 1; }
curl -s "https://api.telegram.org/bot$T/setWebhook" -H 'content-type: application/json' \
  -d "{\"url\":\"${TG_WEBHOOK_URL:-https://realufo.org/__tg}\",\"secret_token\":\"$S\",\"allowed_updates\":[\"message\",\"callback_query\"],\"drop_pending_updates\":true}"
echo
curl -s "https://api.telegram.org/bot$T/getWebhookInfo" | python3 -c 'import json,sys; r=json.load(sys.stdin)["result"]; print("url:", r.get("url"), "| pending:", r.get("pending_update_count"), "| last error:", r.get("last_error_message", "-"))'
