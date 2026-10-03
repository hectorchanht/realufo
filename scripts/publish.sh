#!/usr/bin/env bash
# Publish one archive record to X and every enabled social platform right now.
#
#   scripts/publish.sh RECORD_ID [GIT_REF]     (GIT_REF defaults to HEAD)
#   scripts/publish.sh --drain [GIT_REF]       no new X post: just run the fan-out every
#                                              minute until every posted X post (since
#                                              SOCIAL_SINCE) has a row on every enabled
#                                              platform — re-posts soft-deleted rows
#
# How: deploys GIT_REF from a clean worktree with an every-minute cron and
# X_FORCE_PICK=RECORD_ID (neither is committed). The X bot posts the record at
# the next minute, the social fan-out mirrors it in the same tick, and this
# script polls D1 until every enabled platform has a final row, then redeploys
# GIT_REF unchanged (normal "0 */3 * * *" cron) — also on Ctrl-C or error.
set -euo pipefail

ID=${1:?usage: scripts/publish.sh RECORD_ID [GIT_REF]}
REF=${2:-HEAD}
ROOT=$(git rev-parse --show-toplevel)
W=$(mktemp -d)/publish-wt
TIMEOUT_MIN=${PUBLISH_TIMEOUT_MIN:-15}

# The repo-root .env holds a narrow CLOUDFLARE_API_TOKEN that can't deploy; --env-file
# /dev/null makes wrangler use the OAuth login instead.
q() {
  npx wrangler d1 execute realufo-db --remote --env-file /dev/null --json --command "$1" 2>/dev/null |
    python3 -c 'import json,sys; d=json.load(sys.stdin); d=d[0] if isinstance(d,list) else d; print(json.dumps(d.get("results",[])))'
}

DRAIN=; [ "$ID" = "--drain" ] && DRAIN=1

if [ -z "$DRAIN" ]; then
echo "== preflight $ID"
rec=$(q "SELECT id,kind,status,(SELECT count(*) FROM x_posts p WHERE p.stream='pick' AND p.ref=r.id) posted FROM records r WHERE id='${ID//\'/}'")
python3 - "$rec" <<'PY'
import json, sys
r = json.loads(sys.argv[1])
if not r: sys.exit("record not found")
r = r[0]
if r["status"] != "live": sys.exit(f"record is {r['status']}, not live")
if r["posted"]: sys.exit("already published as a pick (X_FORCE_PICK only posts unposted records)")
print(f"ok: {r['id']} ({r['kind']})")
PY
today=$(q "SELECT count(*) n FROM x_posts WHERE status!='failed' AND date(created_at)=date('now')")
echo "X posts today: $today (X_DAILY_MAX in wrangler.jsonc caps it)"
fi

restore() {
  echo "== restoring normal deploy of $REF"
  (cd "$W" && git checkout -- wrangler.jsonc && pnpm run deploy >"$W/restore.log" 2>&1 && grep -E "Current Version ID|schedule" "$W/restore.log") ||
    echo "!! RESTORE FAILED — redeploy $REF yourself (log: $W/restore.log)"
  git -C "$ROOT" worktree remove --force "$W" 2>/dev/null || true
}

git -C "$ROOT" worktree add --detach "$W" "$REF" >/dev/null
trap restore EXIT
cp "$ROOT/.dev.vars" "$W/" 2>/dev/null || true
(cd "$W" && pnpm install --frozen-lockfile >/dev/null && cd web && pnpm install --frozen-lockfile >/dev/null)
sed -i '' 's|"crons": \["0 \*/3 \* \* \*"\]|"crons": ["* * * * *"]|' "$W/wrangler.jsonc"
grep -q '"\* \* \* \* \*"' "$W/wrangler.jsonc" || { echo "cron line not found in wrangler.jsonc"; exit 1; }
enabled=$(grep -o '"FEATURE_SOCIAL_[A-Z]*": "on"' "$W/wrangler.jsonc" | wc -l | tr -d ' ')

VARS=(); [ -z "$DRAIN" ] && VARS=(--var "X_FORCE_PICK:$ID")
echo "== deploying $REF with every-minute cron ${DRAIN:+(drain)}${DRAIN:-+ X_FORCE_PICK=$ID}"
# Same steps as `pnpm run deploy`, with the extra var on the wrangler call.
(cd "$W" && npx wrangler d1 migrations apply realufo-db --remote --env-file /dev/null && pnpm build:web &&
  npx wrangler deploy --env-file /dev/null ${VARS[@]+"${VARS[@]}"}) >"$W/deploy.log" 2>&1 || { tail -20 "$W/deploy.log"; exit 1; }
grep -E "Current Version ID" "$W/deploy.log"

if [ -n "$DRAIN" ]; then
  since=$(grep -o '"SOCIAL_SINCE": "[^"]*"' "$W/wrangler.jsonc" | cut -d'"' -f4)
  plats=$(grep -o '"FEATURE_SOCIAL_[A-Z]*": "on"' "$W/wrangler.jsonc" | sed 's/"FEATURE_SOCIAL_\([A-Z]*\)".*/\1/' | tr 'A-Z' 'a-z' | sed "s/.*/'&'/" | paste -sd, -)
  echo "== draining unposted X posts since $since to: $plats (up to ${TIMEOUT_MIN} min)"
  deadline=$(( $(date +%s) + TIMEOUT_MIN * 60 ))
  while :; do
    sleep 30
    left=$(q "SELECT count(*) n FROM x_posts x, (SELECT value p FROM json_each('[${plats//\'/\"}]')) pl WHERE x.status='posted' AND x.created_at >= '$since' AND NOT EXISTS (SELECT 1 FROM social_posts s WHERE s.x_post_id=x.id AND s.platform=pl.p AND s.deleted_at IS NULL)")
    busy=$(q "SELECT count(*) n FROM social_posts WHERE status IN ('pending','processing') AND deleted_at IS NULL")
    echo "missing=$left busy=$busy" >&2
    [[ "$left" == *'"n": 0'* && "$busy" == *'"n": 0'* ]] && break
    [ "$(date +%s)" -ge "$deadline" ] && { echo "timed out"; break; }
  done
  q "SELECT x.ref, s.platform, s.status, coalesce(s.remote_id, substr(s.error,1,100)) detail FROM social_posts s JOIN x_posts x ON x.id=s.x_post_id WHERE s.deleted_at IS NULL AND s.created_at >= datetime('now','-30 minutes') ORDER BY x.id, s.platform" |
    python3 -c 'import json,sys
for r in json.load(sys.stdin): print("%-16s %-8s %-10s %s" % (r["ref"], r["platform"], r["status"], r["detail"] or ""))'
  exit 0
fi

echo "== waiting for X + $enabled social platforms (up to ${TIMEOUT_MIN} min)"
deadline=$(( $(date +%s) + TIMEOUT_MIN * 60 ))
while :; do
  sleep 30
  x=$(q "SELECT id,status,tweet_id,error FROM x_posts WHERE stream='pick' AND ref='${ID//\'/}'")
  s=$(q "SELECT s.platform,s.status,s.remote_id,substr(s.error,1,160) error FROM social_posts s JOIN x_posts p ON p.id=s.x_post_id WHERE p.stream='pick' AND p.ref='${ID//\'/}' ORDER BY s.platform")
  done_=$(python3 - "$x" "$s" "$enabled" <<'PY'
import json, sys
x, s, n = json.loads(sys.argv[1]), json.loads(sys.argv[2]), int(sys.argv[3])
xs = x[0]["status"] if x else "none"
busy = [r for r in s if r["status"] in ("pending", "processing")]
print(f"x={xs} social={len(s)}/{n} busy={len(busy)}", file=sys.stderr)
print("1" if xs == "failed" or (xs == "posted" and len(s) >= n and not busy) else "0")
PY
)
  [ "$done_" = 1 ] && break
  [ "$(date +%s)" -ge "$deadline" ] && { echo "timed out; rows so far below"; break; }
done
echo "== result"
python3 - "$x" "$s" <<'PY'
import json, sys
for r in json.loads(sys.argv[1]): print(f"x        {r['status']:10} {r.get('tweet_id') or r.get('error') or ''}")
for r in json.loads(sys.argv[2]): print(f"{r['platform']:8} {r['status']:10} {r.get('remote_id') or r.get('error') or ''}")
PY
