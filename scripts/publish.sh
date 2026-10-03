#!/usr/bin/env bash
# Publish one archive record to X and every enabled social platform right now.
#
#   scripts/publish.sh RECORD_ID     post RECORD_ID to X, then mirror it everywhere
#   scripts/publish.sh --showcase RECORD_ID FILE.mp4 "TEXT"
#                                    hand-made Short about a record: uploads FILE to R2
#                                    showcase/<archive>/<ID>.mp4, posts it with TEXT to X,
#                                    then mirrors it everywhere (once per record)
#   scripts/publish.sh --drain       no new X post: re-run the fan-out until every posted
#                                    X post (since SOCIAL_SINCE) has a live row on every
#                                    enabled platform — re-posts soft-deleted rows
#
# How: calls POST https://realufo.org/__tick (one cron tick on demand, ?force=ID for the
# X pick) every 30 s until done. No deploys, no cron changes. Needs ADMIN_TOKEN in the
# repo-root .env, matching the Worker secret of the same name (one-time setup below).
set -euo pipefail

ID=${1:?usage: scripts/publish.sh RECORD_ID | --showcase RECORD_ID FILE.mp4 "TEXT" | --drain}
STREAM=pick; QS=
if [ "$ID" = "--showcase" ]; then
  ID=${2:?--showcase RECORD_ID FILE.mp4 "TEXT"}; FILE=${3:?missing FILE.mp4}; TEXT=${4:?missing TEXT}
  [ -s "$FILE" ] || { echo "no such file: $FILE"; exit 1; }
  STREAM=showcase
  QS="showcase=$(python3 -c 'import sys,urllib.parse as u; print(u.quote(sys.argv[1]))' "$ID")&text=$(python3 -c 'import sys,urllib.parse as u; print(u.quote(sys.argv[1]))' "$TEXT")"
fi
ROOT=$(git rev-parse --show-toplevel)
SITE=${PUBLISH_SITE:-https://realufo.org}
TIMEOUT_MIN=${PUBLISH_TIMEOUT_MIN:-15}
DRAIN=; [ "$ID" = "--drain" ] && DRAIN=1
# The repo-root .env holds a narrow CLOUDFLARE_API_TOKEN that can't read D1; --env-file
# /dev/null makes wrangler use the OAuth login instead.
q() {
  npx wrangler d1 execute realufo-db --remote --env-file /dev/null --json --command "$1" 2>/dev/null |
    python3 -c 'import json,sys; d=json.load(sys.stdin); d=d[0] if isinstance(d,list) else d; print(json.dumps(d.get("results",[])))'
}

TOKEN=$(grep -s '^ADMIN_TOKEN=' "$ROOT/.env" | cut -d= -f2- || true)
if [ -z "$TOKEN" ]; then
  cat <<'EOF'
ADMIN_TOKEN is not set. One-time setup (run yourself; the value is never printed):
  t=$(openssl rand -hex 32) && printf '\nADMIN_TOKEN=%s\n' "$t" >> .env &&
  printf %s "$t" | npx wrangler secret put ADMIN_TOKEN --env-file /dev/null
EOF
  exit 1
fi
tick() { # $1 = query string ("" for a plain tick)
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 300 -X POST -H "Authorization: Bearer $TOKEN" "$SITE/__tick${1:+?$1}")
  [ "$code" = 200 ] || { echo "!! /__tick returned $code (deployed code lacks /__tick, or ADMIN_TOKEN differs from the Worker secret)"; exit 1; }
}

cfg="$ROOT/wrangler.jsonc"
since=$(grep -o '"SOCIAL_SINCE": "[^"]*"' "$cfg" | cut -d'"' -f4)
plats=$(grep -o '"FEATURE_SOCIAL_[A-Z]*": "on"' "$cfg" | sed 's/"FEATURE_SOCIAL_\([A-Z]*\)".*/\1/' | tr 'A-Z' 'a-z' | sed 's/.*/"&"/' | paste -sd, -)
enabled=$(echo "$plats" | tr ',' '\n' | grep -c .)

if [ -z "$DRAIN" ]; then
  echo "== preflight $ID"
  rec=$(q "SELECT id,kind,status,archive,(SELECT count(*) FROM x_posts p WHERE p.stream='$STREAM' AND p.ref=r.id) posted FROM records r WHERE id='${ID//\'/}'")
  python3 - "$rec" <<'PY'
import json, sys
r = json.loads(sys.argv[1])
if not r: sys.exit("record not found")
r = r[0]
if r["status"] != "live": sys.exit(f"record is {r['status']}, not live")
if r["posted"]: sys.exit("already published on this stream (to re-post one platform, soft-delete its row and use --drain)")
print(f"ok: {r['id']} ({r['kind']})")
PY
  echo "X posts today: $(q "SELECT count(*) n FROM x_posts WHERE status!='failed' AND date(created_at)=date('now')") (X_DAILY_MAX caps it)"
  if [ "$STREAM" = showcase ]; then
    arch=$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])[0]["archive"])' "$rec")
    echo "== uploading $FILE -> showcase/$arch/$ID.mp4"
    npx wrangler r2 object put "realufo/showcase/$arch/$ID.mp4" --file "$FILE" --content-type video/mp4 \
      --cache-control "public, max-age=2592000" --remote --env-file /dev/null >/dev/null
  else
    QS="force=$ID"
  fi
fi

echo "== ticking $SITE/__tick every 30 s (up to ${TIMEOUT_MIN} min) for: $plats"
deadline=$(( $(date +%s) + TIMEOUT_MIN * 60 ))
while :; do
  tick "$QS"
  if [ -n "$DRAIN" ]; then
    left=$(q "SELECT count(*) n FROM x_posts x, (SELECT value p FROM json_each('[$plats]')) pl WHERE x.status='posted' AND x.created_at >= '$since' AND NOT EXISTS (SELECT 1 FROM social_posts s WHERE s.x_post_id=x.id AND s.platform=pl.p AND s.deleted_at IS NULL)")
    busy=$(q "SELECT count(*) n FROM social_posts WHERE status IN ('pending','processing') AND deleted_at IS NULL")
    echo "missing=$left busy=$busy"
    [[ "$left" == *'"n": 0'* && "$busy" == *'"n": 0'* ]] && break
  else
    x=$(q "SELECT status FROM x_posts WHERE stream='$STREAM' AND ref='${ID//\'/}'")
    s=$(q "SELECT s.status FROM social_posts s JOIN x_posts p ON p.id=s.x_post_id WHERE p.stream='$STREAM' AND p.ref='${ID//\'/}' AND s.deleted_at IS NULL")
    done_=$(python3 - "$x" "$s" "$enabled" <<'PY'
import json, sys
x, s, n = json.loads(sys.argv[1]), json.loads(sys.argv[2]), int(sys.argv[3])
xs = x[0]["status"] if x else "none"
busy = sum(r["status"] in ("pending", "processing") for r in s)
print(f"x={xs} social={len(s)}/{n} busy={busy}", file=sys.stderr)
print("1" if xs == "failed" or (xs == "posted" and len(s) >= n and not busy) else "0")
PY
)
    [ "$done_" = 1 ] && break
  fi
  [ "$(date +%s)" -ge "$deadline" ] && { echo "timed out (YouTube's daily cap or slow uploads finish on later cron ticks)"; break; }
  sleep 30
done

echo "== result"
if [ -n "$DRAIN" ]; then where="s.created_at >= datetime('now','-$((TIMEOUT_MIN + 5)) minutes')"; else where="x.stream='$STREAM' AND x.ref='${ID//\'/}'"; fi
q "SELECT x.ref, s.platform, s.status, coalesce(s.remote_id, substr(s.error,1,100)) detail FROM social_posts s JOIN x_posts x ON x.id=s.x_post_id WHERE s.deleted_at IS NULL AND $where ORDER BY x.id, s.platform" |
  python3 -c 'import json,sys
for r in json.load(sys.stdin): print("%-16s %-8s %-10s %s" % (r["ref"], r["platform"], r["status"], r["detail"] or ""))'
if [ -z "$DRAIN" ]; then
  q "SELECT status, tweet_id FROM x_posts WHERE stream='$STREAM' AND ref='${ID//\'/}'" | python3 -c 'import json,sys
for r in json.load(sys.stdin): print("%-16s %-8s %-10s %s" % ("", "x", r["status"], r["tweet_id"] or ""))'
fi
