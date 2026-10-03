---
name: publish
description: Use when the user wants to post / publish / share a specific RealUFO archive record (e.g. "post DOW-UAP-PR104 on all platforms") to X and the social accounts (Bluesky, Facebook, Instagram, Threads, YouTube, TikTok) now, instead of waiting for the bot's daily picks.
---

# Publish a record to every platform

`scripts/publish.sh RECORD_ID` does it end to end:

1. **Preflight**: the record must be `live` and never posted as a pick (the X bot posts each record once). Prints today's X post count; `X_DAILY_MAX` / `X_MONTHLY_USD_CAP` in `wrangler.jsonc` still apply.
2. Deploys HEAD from a clean worktree with an **every-minute cron** and `--var X_FORCE_PICK:RECORD_ID` (nothing committed). The X bot posts the record at the next minute; the social fan-out mirrors that X post to every `FEATURE_SOCIAL_* = "on"` platform in the same tick.
3. Polls D1 until X is `posted` and every enabled platform has a final row, then prints a result table.
4. **Always redeploys HEAD unchanged** (normal `0 */3 * * *` cron) on exit, Ctrl-C or error.

```bash
scripts/publish.sh DOW-UAP-PR104
```

## Before running

- Deploy rules still hold: it deploys **HEAD** (or the git ref given as the 2nd arg). Other chats share this checkout, so check `git log origin/build/app-foundation..HEAD` for commits that shouldn't ship.
- Takes 2–5 min. Instagram, YouTube and TikTok upload asynchronously and finish on a later minute tick.
- Media: videos need `clips/<archive>/<id>.mp4` (X, Facebook, Threads, Bluesky) and `clips-v/...` (vertical, for Instagram, YouTube, TikTok); without a clip, image or pdf records use the thumbnail and YouTube and TikTok skip them ("no video").

## After

- Report each platform's row. Known non-bugs:
  - **YouTube** uploads stay *private* until Google's YouTube API audit passes.
  - **TikTok** posts are SELF_ONLY, and fail with `unaudited_client_can_only_post_to_private_accounts` unless the authorized TikTok account is set to private, until TikTok approves the app.
- **Retrying one platform**: failed rows are never retried automatically. The user deletes that row (the auto-mode classifier blocks Claude from production D1 deletes), and the next cron tick (or another publish run) re-posts it:
  ```bash
  npx wrangler d1 execute realufo-db --remote --env-file /dev/null --command "DELETE FROM social_posts WHERE platform='tiktok' AND x_post_id=(SELECT id FROM x_posts WHERE stream='pick' AND ref='RECORD_ID')"
  ```
- After any live data change, push changed pages to IndexNow (`crawler/indexnow.py`).
