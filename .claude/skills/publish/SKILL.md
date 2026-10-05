---
name: publish
description: Use when the user wants to post / publish / share a specific RealUFO archive record (e.g. "post DOW-UAP-PR104 on all platforms") to X and the social accounts (Bluesky, Facebook, Instagram, Threads, YouTube, TikTok) now, instead of waiting for the bot's daily picks — or to re-post rows a platform missed.
---

# Publish a record to every platform

`scripts/publish.sh` drives the Worker's `POST /__tick` endpoint: one cron tick on demand (X bot, then the social fan-out), authenticated with `ADMIN_TOKEN`. No deploys and no cron changes. (The old every-minute-cron trick was unreliable: Cloudflare can take many minutes to apply cron changes after rapid redeploys.)

**Telegram gate (FEATURE_GATE=on, 2026-10-04):** every post (bot, `publish.sh`, `article.py`) first lands as a preview in the owner's private chat with @real_ufo_bot. Nothing posts until the owner taps ✅. Replying to a preview replaces its text. `publish.sh` prints the job number and keeps polling; after the tap the cron finishes the fan-out. Admin commands: `/post <ID>`, `/queue`, `/status`, `/pause`, `/resume`, `/drain`, `/skip <job>`, or send an mp4 with caption `<ID> text`. The Telegram channel @realufo_org is a fan-out platform (`FEATURE_SOCIAL_TG`). When clearing tg dry-run drafts before flipping `FEATURE_SOCIAL_TG` to "on", delete only rows with `platform='tg' AND status='draft' AND error IS NULL` — the pre-gate backlog rows carry an error note and must stay.

```bash
scripts/publish.sh DOW-UAP-PR104   # queue this record: Telegram preview → ✅ → X, then mirrored everywhere
scripts/publish.sh --drain         # re-post soft-deleted rows / anything a platform missed
```

- **RECORD_ID**: preflight (record `live`, never posted as a pick). It then ticks with `?force=ID` (X_FORCE_PICK for that call only) every 30 s: the first tick queues the Telegram preview, and the script keeps polling (default timeout 60 min, `PUBLISH_TIMEOUT_MIN`) until the owner taps ✅ and X is `posted` and every enabled platform has a final row. ❌ ends the script (exit 0). If it times out, the cron still finishes after a late ✅. `X_DAILY_MAX` and `X_MONTHLY_USD_CAP` still apply.
- **--drain**: ticks until every posted X post since `SOCIAL_SINCE` has a live row on every enabled platform. The fan-out posts one X post per platform per tick.
- To re-post: **soft-delete** the rows first (`UPDATE social_posts SET deleted_at=datetime('now') WHERE …`). **Never hard `DELETE`**; the user wants the history kept.

## One-time setup

`ADMIN_TOKEN` must be in the repo-root `.env` and set as the Worker secret. The auto-mode classifier blocks Claude from writing secrets, so the **user** runs this:

```bash
t=$(openssl rand -hex 32) && printf '\nADMIN_TOKEN=%s\n' "$t" >> .env && printf %s "$t" | npx wrangler secret put ADMIN_TOKEN --env-file /dev/null
```

## Known non-bugs

- **YouTube**: `YT_DAILY_MAX` (5) is a rolling 24 h window that also counts soft-deleted rows, because those uploads really happened. Over the cap, the item is skipped and goes out on a later tick; it is not failed.
- **TikTok**: the sandbox app posts SELF_ONLY, and fails with `unaudited_client_can_only_post_to_private_accounts` unless the authorized TikTok account is private, until TikTok approves the app.
- **After any social account re-auth, verify the target account** (e.g. YouTube: the watch page's `ownerChannelName`). Instagram and YouTube both first went to the owner's personal accounts.
- After any live data change, push changed pages to IndexNow (`crawler/indexnow.py`).
