# Story polls: vote on the site and on social (Spec 9)

Date: 2026-10-03 · Status: approved design, pending spec review

## Goal

Every story (article, `/thread/ar_<slug>`) asks the crowd its own question, e.g. teardrop-twins:
"Balloon or craft?" → Balloon / Drone / Unknown craft / Need more data. People vote on the site and
in a native X poll (Threads too if its API allows). The site shows both crowds. Aim: engagement,
on the site and on the posts.

User decisions (2026-10-03):
- A **custom question per story** (not the file WTF-meter).
- **Native polls plus a merged view**: X (and Threads if possible) get real polls, and the site shows
  the social result next to its own. The other platforms get a "Vote →" link.
- **Backfill**: the 7 existing stories get a site poll and an X poll reply on their existing thread.

Out of scope (YAGNI): polls on doc-page story cards, one combined site+X percentage (shown as two
numbers), polls on files (they have the WTF-meter), Bluesky/FB/IG/YT/TikTok native polls (no API).

## Data (migration 0030_story_polls.sql)

```sql
ALTER TABLE articles ADD COLUMN poll TEXT;   -- {"q": "...", "opts": ["...", ...]} or NULL
CREATE TABLE poll_votes (
  actor_id   TEXT NOT NULL,
  slug       TEXT NOT NULL REFERENCES articles(slug),
  opt        INTEGER NOT NULL,                -- index into poll.opts
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (actor_id, slug)
);
CREATE TABLE poll_social (
  slug       TEXT NOT NULL REFERENCES articles(slug),
  platform   TEXT NOT NULL CHECK(platform IN ('x','threads')),
  remote_id  TEXT,                            -- poll tweet / Threads post id; NULL = in flight
  status     TEXT NOT NULL CHECK(status IN ('pending','posted','failed')),
  closes_at  TEXT,                            -- UTC 'YYYY-MM-DD HH:MM:SS'
  counts     TEXT,                            -- JSON int array aligned to poll.opts
  total      INTEGER,
  fetched_at TEXT,
  cost_usd   REAL NOT NULL DEFAULT 0,
  error      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (slug, platform)
);
```

Poll rules (enforced in `article.py` and again in the Worker): `q` ≤ 100 chars; 2–4 `opts`,
each 1–25 chars (X's limits); options unique.

Changing `opts` on a live poll would mismatch stored votes: `article.py` refuses to change `opts`
once `poll_votes` or `poll_social` rows exist for the slug (`q` wording may change).

## Site

### API — `worker/routes/polls.ts` (copies `verdicts.ts`)

- `GET /api/articles/:slug/poll` → `{ q, opts, mine: number|null, total, tally?: number[], social: [{platform, counts, total, closed}] }`
  - 404 if the article has no poll.
  - `tally` only when `mine` is set (same rule as verdicts: vote to see the split). `total` is always shown.
  - `social` is always shown (it's public on X anyway). A row with no counts yet is left out.
  - No edge cache (per-visitor `mine`); `Cache-Control: private, no-store`.
- `POST /api/articles/:slug/poll` `{ opt }` → same shape.
  - `actorId` (anon), `allowWrite(env, req, "vote")`, 400 for a bad opt, 404 for no poll.
  - Posting your current opt clears it; another opt switches (UPSERT).

### UI — `web/src/components/PollCard.tsx`

On `Thread.tsx`, when `thread.id` starts with `ar_`, render `PollCard` directly under the OP post.
It fetches the poll by slug (`id.slice(3)`); with no poll (404) it renders nothing.

- Header `CROWD POLL` (mono, like `WTF-METER`), the question in the body font.
- One button per option, full width, stacked (options are up to 25 chars).
  - Pressed = accent border. Double-tap guard like `VerdictBar` (`DOUBLE_TAP_MS`).
- After you vote:
  - total ≥ 5: each button fills as a percentage bar.
  - total < 5: `Early days — N votes`.
- Before you vote: `? ? ? Vote to reveal the crowd · N votes`.
- Social line, under the buttons, whenever `social` has data: `On X: 71% Balloon · 412 votes` (the
  top option), `(final)` once closed. Shown before you vote too; it is a hook to vote, not the site split.
- `aria-live="polite"` for the revealed numbers. Buttons have `aria-pressed`, 44 px min height.
- Errors → overlay toast (same as `VerdictBar`).

`web/src/api/queries.ts`: `usePoll(slug)`, `useCastPoll(slug)` (sets query data from the response).

## X poll (worker/lib/xpoll.ts, called from `runTick` after `socialTick`)

One path for new stories and the backfill: on each cron tick (every 3 h) the bot looks for articles
that have a poll and a posted showcase head tweet but no X poll yet.

```sql
SELECT a.slug, a.poll, x.tweet_id FROM articles a
JOIN threads t ON t.id = a.thread_id
JOIN x_posts x ON x.stream='showcase' AND x.ref=t.source_record_id AND x.status='posted'
LEFT JOIN poll_social p ON p.slug=a.slug AND p.platform='x'
WHERE a.poll IS NOT NULL AND p.slug IS NULL
LIMIT 1
```

(`threads.source_record_id` = `showcase_record`, which `article.py` already writes.)

- Gated by `FEATURE_X === "on"` plus a new `X_POLLS` var (`"on"` to post; anything else = off). This
  keeps the user's rule: nothing goes to social before they OK the questions.
- Budget: `withinBudget(env, cost, now, manual=true)` (operator content skips the daily count; the
  monthly $ cap applies). `withinBudget` adds `poll_social.cost_usd` to its month sum.
- Post:
  - Insert the `poll_social` row (`pending`) before calling X, so a retry can't double-post.
  - Reply to the head tweet: `createPost(s, text, [], tweet_id, { options, duration_minutes: 4320 })`.
  - `createPost` gains an optional `poll` arg (mutually exclusive with media, per the X API).
  - Text: `"<q> 👇"`, with **no link**: $0.015 versus $0.20 with a URL
    (xpick `costOf`), and the thread's last tweet already links the story.
  - Success → `posted`, `remote_id`, `closes_at = now + 3 d`, `cost_usd = 0.015`.
  - Error handling copies `xbot.post`:
    - XError 401/402/403 (not duplicate) → delete the row (retry later).
    - Other XError → `failed` + error.
    - Network error → stays `pending` and is never auto-retried; fix it by hand, as for the head tweet.
- One poll per tick (the LIMIT 1): the 7-story backfill spreads over ~a day without bursting.

### Results

On each tick, for `platform='x'` rows that are `posted` and either open and `fetched_at` older than
20 h, or closed and not yet read after `closes_at`:

`GET /2/tweets/:id?expansions=attachments.poll_ids&poll.fields=options,voting_status`
→ `counts` (votes per option, in `position` order), `total`, `fetched_at`; a status of `closed` marks
it final. At most one read per tick. Read cost is not tracked: about 4 reads per poll, below the cap's
noise. ponytail: price it if X bills reads materially.

## Threads (gated by a probe)

Plan task 1 is a probe: create a Threads TEXT reply with a poll attachment to an existing Threads
post (`reply_to_id`), using the API.
- **Works:** `xpoll.ts` gets the same flow for `platform='threads'`, keyed on the article's
  `social_posts` threads row (`remote_id`). Results come from the post's poll fields.
- **Doesn't work** (or needs an app review we don't have): Threads uses the CTA line below. Note it in
  the spec and drop the threads rows from the plan.

**Probe 2026-10-03 (containers only, nothing published):**
- Polls are supported. `poll_attachment={"option_a":…,"option_b":…}` on a TEXT container from `/me/threads` returns a container id.
- Replies are not: any `reply_to_id` container, even plain text without a poll, fails with code 10, "Application does not have permission for this action". The token lacks `threads_manage_replies`.
- Docs (developers.facebook.com/documentation/threads/create-posts/polls): `option_X_votes_percentage` is a 0–1 fraction (0.10), not 0–100. Polls run on TEXT posts only.
- So: a Threads poll is either a standalone post, or a reply after re-authorising the app with `threads_manage_replies`.

## Other platforms: CTA copy

`article.py --social`: when `poll` is set, the last part ends with
`\n<q> Vote → https://realufo.org/thread/ar_<slug>` instead of `\nFull story: …`. Every platform
mirroring the X text (FB, IG, Threads caption, YT, TikTok, Bluesky head-only) carries it. This is a
copy change only, with no adapter code.

## article.json + article.py

- `article.json` gets an optional `poll: { q, opts }`.
- `article.py`:
  - Validates the poll (rules above).
  - Writes `articles.poll`.
  - Refuses to change `opts` once votes or a social poll exist.
  - Prints the X poll text it will post.
- The `publish-article` skill: add a "poll" step. Write a question whose options a newcomer can pick
  from in 2 seconds, with "Need more data" as the safe last option, and no leading wording ("Obviously
  a balloon?").

## Rollout

1. Migration 0030 (check pending migrations first, per the deploy rule), deploy the Worker + web
   with `X_POLLS` unset.
2. Write the 7 questions (teardrop-twins, two-stars, into-the-sea, gunship, warp-drives,
   green-fireballs/nukes, area-51) into each `article.json`, **show them to the user**, then
   `article.py SLUG` for each (site poll live).
3. User OK → `X_POLLS=on`. The cron posts one X poll per tick to stories whose showcase thread is
   posted (area-51 waits until its Short goes out).
4. IndexNow the 7 thread URLs (feedback rule: after a live data update).

## Testing

- Worker (`worker/tests/polls.test.ts`):
  - Cast, switch and clear a vote.
  - Tally withheld before voting.
  - 404 when there is no poll; 400 for a bad opt.
  - Rate limit.
- Worker (`worker/tests/xpoll.test.ts`, mocked fetch):
  - Picks only articles with a posted showcase.
  - Inserts the row before the X call and posts once.
  - The poll body has no media and replies to the head tweet.
  - A 402 deletes the row.
  - Results parsing maps `position` to `opts`, and `closed` marks the row final.
  - `X_POLLS` off = no call.
- `withinBudget` counts `poll_social.cost_usd`.
- Web (`web/src/tests/poll.test.tsx`): states before voting, under 5, 5 or more, and with the social line;
  renders nothing on 404.
- `article.py`: the poll validation and the opts-change refusal (one `__main__` assert self-check,
  or a dry `--check` run).
