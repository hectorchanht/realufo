# RealUFO — Telegram admin center: one gate for all posting + auto Shorts

Date: 2026-10-04 · Status: approved design, pending spec review

## Why

User rules (2026-10-04):

- "before publishing any vid, need a ok from me first … sent vid privately … first"
- "the gate should be set before making the video, like sending me all the 案件大綱 影片內容 結論 主要數字 重點笑料 爆點 狀態 風格 etc first"
- "auto clips need to fulfill all the making-shorts area too"
- "use other ai to replace local claude, how about cf ai tool"
- "post vid in telegram too" · "manual creating and publishing shorts or vid or post … on the tg bot, basically my admin center"
- "a tg act as another vid distributor and gate on all posting everywhere"

Today the X bot (`worker/lib/xpick.ts`) posts a random `clips/` video daily with only ID + title + realufo.org
burned in (`crawler/ingest/clips.py`), and the fan-out mirrors it to six platforms with no human look.
**Interim (done 2026-10-04):** bot paused, `FEATURE_X=off`, live 74084b18 @ d83ebfa (branch `hotfix/pause-bot`; on
build/app-foundation as 2f73c07). Operator `/__tick?force=|showcase=` still posts, and only the forced item.
11 already-approved showcase Shorts are still queued for YouTube (daily cap); left as is.

## Decisions

- **Messenger:** Telegram bot (user choice over WhatsApp: no 24 h window, 50 MB uploads, free, inline buttons).
- **Telegram = admin center:** private chat with the owner for every approval and manual command.
- **Telegram = 7th platform:** a public channel (e.g. `t.me/realufoorg`), posted by the same bot as channel admin.
- **One gate for all posting everywhere:** nothing reaches X, the 6 fan-out platforms, the Telegram channel or a
  site article thread without an owner tap on Telegram for that exact item. This covers bot picks, release
  announcements, highlights, story polls, `scripts/publish.sh --showcase/--force` and `scripts/article.py`
  (site thread + `--social`). Not gated: archive ingest/data updates, user posts on the site, `--drain` re-posts
  of already-approved items.
- **Two gates for videos the system makes:** brief gate (before rendering) → video gate (before posting).
  Videos the owner made themselves (hand-made showcase, uploaded mp4) get one gate: the final preview.
  Every other post (release, highlight, poll, `/post`) gets one gate: the exact text + media preview.
- **Media in every post** (user: "add vid or at least img (money shoot) in all posting to be attractive to
  eyeball"): no text-only posts. Video when the content has footage, else at least the money-shot image
  (see Media for every post).
- **Maker = fully automatic:** Workers AI writes the brief, GitHub Actions renders (user choice: no local Claude).
- **Brief model:** Workers AI `@cf/openai/gpt-oss-120b` (already used for TL;DRs).
- **Voice:** ElevenLabs (same voice as hand-made Shorts) + ElevenLabs speech-to-text for subtitle timings.
- **Brief language:** 繁體中文 in Telegram; on-screen text, narration and captions in English (as now).
- **v1 is video records only** for auto Shorts. PDF-only records (page / AI-image Shorts) and AI cinematic video
  (no video generation on Workers AI) are v2.

## Flow

```
            cron pick / release / highlight / poll          owner command or publish.sh / article.py
                              \                                   /
                               v                                 v
                           bot_jobs row  ──────────────────────────
                                |
        kind=video (auto) ──────┼────── kind=post | poll | showcase (owner-made video)
                                |                     |
                                |        media (Actions: teaser clip / money-shot still / page crop)
                |               |                     |
   prep (Actions: frames, tracks, vision) → brief (Workers AI) → brief_wait                post_wait  ── Telegram preview: ✅ Post · ❌ Skip
   Telegram: 繁中 brief  ✅ Make · ❌ Skip               |
   reply text = notes → brief rewritten, re-sent        |
                |  ✅                                  |  ✅
   making: workflow_dispatch → GitHub Actions          |
   showcase/auto.py → R2 showcase/<archive>/<ID>.mp4    |
   callback /__short-done → video_wait                 |
   Telegram: mp4 + contact sheet + caption             |
   ✅ Post · ✏️ Re-cut (reply notes) · ❌ Skip            |
                |  ✅                                  |
                └──────────────► approved ◄────────────┘
                                   |
              insert x_posts row (pending) / site thread / poll row
                                   |
              existing X poster + fan-out (fb ig threads bsky yt tiktok + tg channel)
                                   |
                                 posted
```

- Cron pick slot stays `X_PICK_HOURS` (15:00 UTC), one bot pick per day. A stream with an open job makes no
  new job (at most one open job per stream: pick / release / highlight / poll / manual), so an unanswered brief
  never blocks a release announcement.
- Pick rule unchanged: unposted live video record with a clip (`pickCandidate`).
- Release announcements carry the release's best media (teaser clip of its strongest video, else the
  money-shot still), picked by the same media step.

## Quality bar (same as hand-made, or better)

User (2026-10-04): "even using tg admin portal, the quality is still unchange or even better with human gate and
updating". Auto Shorts are held to the hand-made making-shorts bar, not a lower "bot" bar. Workers AI is weaker
than Claude at seeing frames and doing physics, so the pipeline closes those gaps in code and through the gates:

- **Look before writing (prep step).** Before the brief, a GitHub Actions `prep` job extracts frames around
  every AI key moment (contact sheets, as in the skill's "find blink frames"), tracks the bright/dark blob per
  frame (centroid + size, plain python on rawvideo gray, as in the Hellfire analysis), reads fps/resolution,
  and posts the results (`/__prep-done`). The brief then gets: measured px/frame speed, blink/split frame
  numbers, size in px, and a vision-model check (Workers AI `@cf/meta/llama-4-scout-17b-16e-instruct`, image
  input) of which frame shows the event best. Money-shot frames come from measurement, not a guess.
- **Physics only from inputs the file gives.** A metres/km-h figure appears only when the record or its pages
  give range/FOV/altitude (HUD text, mission report); then the code computes it with error bars. Otherwise
  the brief shows px and frames only. The brief lists every input (value + source page) so the owner sees it.
- **Same recipe parts as the best hand-made Shorts.** `showcase/auto.py` reuses the functions of
  `showcase/DOW-UAP-PR116.py`, `showcase/FBI-UAP-PR003.py` and `showcase/CONGRESS-CHRG-119hhrg61718.py`
  (frame stack, `enh()` local contrast, lens inset, `balloon_player`-style site player, cues, two-step mix),
  moved into `showcase/lib.py`, not re-written. Parity test: auto-render PR116 and PR003 from briefs and
  check them against the skill checklist next to the hand-made versions.
- **Unlimited updating at both gates.** Reply notes rewrite the brief or re-cut the video as often as wanted
  (each round = new version, old buttons go stale). The video gate always shows a contact sheet (frame 0 + one
  frame per beat) beside the mp4.
- **The bot learns from notes.** Every owner note is kept (`bot_jobs.notes`). `/lesson <text>` (or ⭐ on a note)
  saves it to `bot_lessons`; all lessons are added to the brief's system prompt and to `auto.py` defaults
  where they are settings (e.g. font size, voice speed). `/lessons` lists them, `/forget <n>` drops one.
- **Escape hatch.** ✋ "hand-make" button on either gate parks the job as `handmade` for a Claude session (the
  making-shorts skill); the finished file comes back through `publish.sh` as a normal Telegram preview.

## Media for every post

Every post carries the most eye-catching honest media the content has, chosen in this order:

| Content | Media |
|---|---|
| Record with footage | **Teaser clip** 6–12 s 9:16 around the money shot (slow-mo on the key frames, `lib.stamp` watermark, site colours, no narration needed; muted-friendly on-screen line). Full Shorts stay for `kind=video`. |
| Footage but platform takes images only, or a poll | **Money-shot still**: the prep step's best frame, enhanced (frame stack + `enh()` local contrast, labelled "enhanced"), lens inset beside the object (never a box on it), watermark |
| PDF / text record | **Page crop**: the strongest quoted page at phone size, quote marked amber per the skill, ID + realufo.org |
| Image record | The image itself, cropped to the subject, watermark |
| Highlight (site thread) | The source record's media by the rules above; never user uploads |
| Release announcement | Strongest video in the release as a teaser clip, else its best still |
| Article | Its Short (head post) + hero image |

- Made by GitHub Actions `step=media` (same prep code: frames, tracks, vision pick), uploaded to R2
  `media/<kind>/<ID>[-vN].mp4|jpg`, shown in the Telegram preview with the exact caption. Notes re-make it.
- **Polls can't hold media** on X (a tweet has a poll or media, not both), on Threads (poll = text post) and on
  Telegram (`sendPoll`). So each poll is posted right after a media post in the same place: as a reply under
  the story's head post (which already has the Short/still) on X/Threads, and as a media message followed by
  the poll in the Telegram channel. Bluesky/FB/IG get the media post with the question in the caption.
- Each platform gets the best form it accepts: video where video posts work (X, Bluesky, FB, IG Reels,
  Threads, YouTube, TikTok, Telegram), still otherwise; YouTube/TikTok get only video items.

## Admin commands (private chat, owner only)

| Command | Does |
|---|---|
| `/short <ID>` | Video job for that record → brief → ✅ → render → ✅ → post |
| `/post <ID>` | Image/text post for that record → preview → ✅ → post |
| mp4 sent with caption `<ID> text` | Owner's own video → preview → ✅ → posted as showcase (bots can download ≤20 MB; bigger via `publish.sh`, which also lands as a Telegram preview) |
| `/queue` | Open jobs + status, each with its buttons |
| `/status` | Today's posts, per-platform failures, month spend vs `X_MONTHLY_USD_CAP` |
| `/pause` · `/resume` | Stop/start the bot's own picks (D1 setting, no redeploy) |
| `/drain` | Re-post approved rows a platform missed (same as `publish.sh --drain`) |
| `/skip <job>` | Drop a job |
| `/lesson <text>` · `/lessons` · `/forget <n>` | Teach / list / drop standing rules for briefs and renders |

Unknown commands get a short help list. v2: articles from the bot, `/poll`, site edits.

## Add to the archive (official + semi-official releases)

User (2026-10-04): "allow adding archive from official or semi-official release like UAP hearing, just like the
hellfire one". The admin center can add new records, not just post existing ones.

- **Inclusion rule** (written into the site's About text and the ingest code):
  - **Official:** published by a government body: war.gov/DoD, AARO, NARA, NASA, FBI Vault, CIA reading room,
    congress.gov / GPO, official committee channels (e.g. House Oversight YouTube), foreign defence ministries.
  - **Semi-official:** made public by a government official acting in that role, e.g. footage shown or released by a
    member of Congress at a UAP hearing or on their official account (the Hellfire/Yemen MQ-9 clip, released by
    Rep. Eric Burlison, House Oversight UAP hearing, Sept 2025), exhibits entered into a hearing record, agency
    documents released through FOIA to a third party.
  - **Not included:** leaks nobody official released, anonymous uploads (separate idea, needs moderation), anything
    not about UFO/UAP (the topical bar that removed the Pentagon Papers).
- **Command:** `/add <url> [note]` (video, PDF or page). A GitHub Actions `step=fetch` job downloads it (yt-dlp for
  video posts and hearing streams, with `--download-sections` when the note gives a time range; plain download for
  PDFs), probes it, and returns a draft record: title, date, place, agency/body, `released_by`, `source_url`,
  `provenance` (`official` | `semi-official`), proposed id, archive (`congress`, `wargov`, … or a new one), and a
  thumbnail/money-shot still.
- **Gate:** the draft record arrives as a Telegram preview (`kind='record'`): ✅ Add · ✏️ (reply to fix fields) · ❌
  Skip. Only ✅ writes `records` + `assets` rows and the R2 files, then the normal ingest steps (thumbs, clips, AI
  moments, OCR/full text) run for it. Adding a record never posts it; posting is a separate job.
- **On the site:** semi-official records show a provenance line on the doc page and in crawler HTML: "Semi-official:
  released by Rep. Eric Burlison at the House Oversight UAP hearing, Sept 9 2025 · source" (link to the original
  post/stream). Official records keep today's look. Licence: the open-dataset export
  (`tung00/realufo-uap-archive`) keeps its open-licence filter; semi-official items enter it only when the source
  is a US government work.
- **Data:** `records` gains `provenance TEXT CHECK(provenance IN ('official','semi-official')) DEFAULT 'official'`,
  `released_by TEXT`, `source_url TEXT`; `bot_jobs.kind` gains `'record'`.
- **First item:** the Hellfire clip (Burlison X post + hearing stream timestamps in memory), linked to the hearing
  transcript record CONGRESS-CHRG-119hhrg61718.
- Built as its own plan (Plan 4), after Plan 1.

## Data (D1)

Migration `00xx_bot_jobs.sql`:

- `bot_jobs(id, kind CHECK(kind IN ('video','post','poll','showcase','article')), stream, ref, record_id,
  status CHECK(status IN ('prep','media','brief_wait','making','video_wait','post_wait','handmade','approved','posted','skipped','failed')),
  prep TEXT /*JSON: frames, tracks, fps, vision pick*/,
  version INTEGER, brief TEXT /*JSON*/, notes TEXT /*JSON list of owner notes*/, caption TEXT, media_key TEXT,
  payload TEXT /*JSON: what to insert on approve*/, tg_msg_id INTEGER, attempts INTEGER, error TEXT,
  created_at, updated_at, deleted_at)`. Soft delete only.
- `bot_job_versions(job_id, version, brief TEXT /*JSON*/, caption TEXT, media_keys TEXT /*JSON*/, notes TEXT,
  decision TEXT /*make|post|recut|skip|null*/, created_at, PRIMARY KEY(job_id, version))`: every brief and every
  render is kept, never overwritten; `bot_jobs` points at the current version. Shows what each note changed.
- `record_evidence(id, record_id, kind CHECK(kind IN ('moment','money_shot','track','measurement','quote',
  'page_crop','still','teaser','contact_sheet','short','fact')), t0 REAL, t1 REAL, frame0 INTEGER, frame1 INTEGER,
  page INTEGER, label TEXT, value TEXT /*JSON: numbers + inputs + error bars, quote text, vision pick…*/,
  media_key TEXT, source CHECK(source IN ('prep','brief','owner','handmade','article')), status
  CHECK(status IN ('found','approved','rejected')), job_id, created_at, deleted_at)`: the reusable evidence store,
  one row per finding. Prep writes measured items (`found`); a brief's numbers/quotes are saved with their page;
  the owner's ✅ on a post marks the evidence it used `approved`; an owner note that corrects a moment or number
  marks the old row `rejected` and adds the corrected one (`source='owner'`).
- Reuse: prep, media and brief read `record_evidence` first. Approved rows are used as is (no re-measure, no
  re-capture); rejected rows are sent to the brief model as "do not use". `/redo <ID>` re-runs prep. Articles
  (`article_records`) and future Shorts of the same record start from the same rows, and approved quotes/numbers
  feed Ask and the doc page later (separate spec).
- Media files in R2 are never overwritten (`-vN` keys), so every `media_key` in these tables stays valid.
- `bot_settings(key PRIMARY KEY, value)`: `paused` (for `/pause`).
- `bot_lessons(id, text, created_at, deleted_at)`: owner lessons fed into every brief.
- `social_posts.platform` CHECK gains `'tg'` (table rebuild, same pattern as 0024, `defer_foreign_keys`).
- On ✅ the job inserts what the old direct path inserted (an `x_posts` row with `status='pending'`, the
  article thread rows, or the poll's `poll_social` row). From there the existing posters run unchanged.

## Telegram

- `worker/lib/tg.ts`: `sendMessage`, `sendPhoto`, `sendVideo` (multipart from R2, ≤50 MB), `sendMediaGroup`
  (contact sheet), `editMessageReplyMarkup`, `answerCallbackQuery`, `setWebhook`.
- Webhook `POST /__tg`: registered with `secret_token`; header `X-Telegram-Bot-Api-Secret-Token` checked with
  `sameSecret`; `from.id` must equal `TELEGRAM_OWNER_ID`, else 200 and ignored.
- Buttons: `callback_data = "<action>:<job id>:<version>"`. A tap moves the job only from the expected status
  (`UPDATE … WHERE id=? AND version=? AND status=?`); stale or double taps do nothing. A rewrite bumps `version`.
- Replying to a brief or video message with text = notes for that job (`reply_to_message.message_id` → job).
- Channel posting = new fan-out platform `tg` in `worker/lib/social/`: video → `sendVideo`, image → `sendPhoto`,
  text → `sendMessage` to `TELEGRAM_CHANNEL`; caption = the same long-form caption the other platforms get,
  ending with the doc link. `FEATURE_SOCIAL_TG` off | dry | on.

## Brief (Worker, Workers AI)

- Input: record summary, full text with page numbers (trimmed to the model's context, best pages first by
  AI moments + summary terms), AI key moments with timestamps, AARO status/verdict words, look-alike/related
  records, video duration, stored crop, owner notes.
- System prompt = the making-shorts skill condensed: beat shape (tease frame 0 → payoff ≤5 s → money shot →
  reveal + lesson → sound bite ≤8 words → DIY end card → loop), "consistent with" wording, unresolved stays
  unresolved, verdicts credited to who said them, numbers with an everyday comparison, watermark line =
  story keyword · when · where · who (keyword must return the record on `/api/records?q=`).
- Output: JSON matching a schema: `outline, beats[{t0,t1,kind,on_screen,say}], conclusion, numbers[{value,
  comparison,source_page}], jokes, hook, status, style, stamp, caption, sources[{page,quote}]`.
- Validation (code, not model): every number and quote must appear in the record text; timestamps within the
  duration; on-screen lines ≤6 words × 2 lines; `stamp` keyword search hit. Failure → retry (≤3 per tick), then
  Telegram "brief failed for <ID>" with ❌ Skip. Never a guessed fact.
- Telegram rendering in 繁中: 案件大綱 · 影片內容 (beats with times) · 結論 · 主要數字 · 重點笑料 · 爆點 · 狀態 ·
  風格 · 浮水印 · 來源 (p.N).

## Render (GitHub Actions)

- Workflow `.github/workflows/short.yml`, `workflow_dispatch` inputs `job_id`, `record_id`, `step` (`prep` | `media` | `render`); the Worker
  dispatches it with `GH_DISPATCH_TOKEN` (fine-grained, this repo, `actions: write` only).
- The job fetches the brief from `GET /__job/<id>` (ADMIN_TOKEN), runs `showcase/auto.py`, uploads
  `showcase/<archive>/<ID>.mp4` (re-cut → next `-vN` key, never overwrite) and `contact/<job>.jpg` to R2, then
  `POST /__short-done` with the keys, or with the error tail on failure.
- `showcase/auto.py` = one generic recipe on `showcase/lib.py`: footage cuts at the brief's beats using the
  stored crop; tease frame 0 (headline + "?" beside the spot, no box over the object); money shot = tightest
  honest crop, 6× slow real frames, frame counter, voice off; reveal + lesson card; sound bite on screen and
  in voice; page capture of `/doc/<ID>?p=N` (headless Chrome 375×812 @2x, quote marked amber per the skill);
  DIY end card `realufo.org/doc/<ID>`; ends on the frame-0 image; `lib.stamp(ID, stamp)` every beat;
  ElevenLabs narration at cues + `lib.subtitles`; blurred full-frame background; site colour tokens;
  1080×1920, 30 fps, 20–35 s.
- Self-checks (the skill's "Before showing the user"): duration, audio stream present, voice-band loudness at
  every cue and quiet at the money shot; contact sheet = frame 0 + one frame per beat. A failed check fails
  the job (Telegram shows why, 🔁 Retry · ❌ Skip).
- Moments and money-shot frames come from the prep step's measurements (see Quality bar); owner notes
  ("money shot at 0:15") override them.

## Operator paths

- `scripts/publish.sh RECORD_ID | --showcase …` → creates a job (`POST /__job`, ADMIN_TOKEN; mp4 uploaded to R2
  first) and prints "waiting for Telegram OK"; no direct tick post.
- `scripts/article.py SLUG [--social]` → same: the site thread and the social post become one `article` job
  with a preview (head text + hero image + Short).
- `/__tick?force=|showcase=` stays for tests but refuses while `FEATURE_GATE=on` unless the item has an
  approved job.

## Config

- Worker secrets: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_OWNER_ID`, `GH_DISPATCH_TOKEN`.
- Worker vars: `TELEGRAM_CHANNEL`, `FEATURE_SOCIAL_TG`, `FEATURE_GATE` (on = every post path goes through
  `bot_jobs`; turned on together with `FEATURE_X`).
- GitHub secrets: `ELEVENLABS_API_KEY`, `ADMIN_TOKEN` (Cloudflare ones exist).

## Failures

- Brief: retry next tick, ≤3, then Telegram notice + ❌ Skip.
- Prep / render: error tail to Telegram, 🔁 Retry · ❌ Skip · ✋ hand-make.
- Telegram API down: job stays in its status; the next tick re-sends any job whose `tg_msg_id` is NULL.
- Posting: existing per-platform retry and drain.

## Testing

- Worker vitest (style of `xpick.spec.ts`): job state machine (each tap only from the right status/version);
  webhook rejects wrong secret and wrong user; reply-notes map to the right job; with `FEATURE_GATE=on` no path
  inserts an `x_posts`/thread/poll row without an approved job; `tg` platform request shapes; brief validator
  drops unsourced numbers/quotes and out-of-range timestamps; lessons reach the brief prompt; a rewrite adds a `bot_job_versions` row and leaves the old one intact;
  approved `record_evidence` is reused without re-measuring and rejected rows never reach a brief as facts; no job reaches `post_wait` without a media key (every post has media); polls
  are inserted only after their media post.
- Python: `showcase/auto.py --dry-run` on a fixture brief asserts the beat timeline and filter graph without
  rendering; blob tracker test on a synthetic moving-dot clip (`crawler/ingest/tests` style).
- Parity: PR116 + PR003 auto-rendered vs the hand-made Shorts against the skill checklist, before go-live.

## Rollout

1. Owner creates the bot + channel, stores the token (`read -s … | wrangler secret put TELEGRAM_BOT_TOKEN`),
   presses Start; chat id read from `getUpdates` → `TELEGRAM_OWNER_ID`.
2. Deploy with `FEATURE_GATE=on`, `FEATURE_X=off`, `FEATURE_SOCIAL_TG=dry`; apply the migration; `setWebhook`.
3. Parity check (PR116, PR003), then `/short <ID>` on one new record end to end (prep → brief → render →
   preview), skip the post.
4. `FEATURE_SOCIAL_TG=on`, then `FEATURE_X=on`: bot picks resume, all through Telegram.
5. Update skills (publish, publish-article, making-shorts, story-polls) to say every post lands as a Telegram job.
6. Backfill `record_evidence` from work already done (one-off script, `source='handmade'`/`'article'`,
   `status='approved'`): `article_records` moments + images (articles 1–7), the hand-made Shorts' recipe
   docstrings (frame numbers, crops, measurements: PR116, PR003, AARO-956955, Hellfire incl. the
   scale/track/momentum/speed numbers), and their R2 Shorts as `kind='short'`.
