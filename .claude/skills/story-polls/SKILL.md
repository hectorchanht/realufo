---
name: story-polls
description: Use when the user wants a crowd poll / vote question on a RealUFO story (article, /thread/ar_<slug>), wants to change or check one, or asks where a story's X or Threads poll is, for its links, or how the vote is going.
---

# Story polls

Each story can ask one crowd question. The same `poll` field in `article.json` drives three places:
- **Site:** a "Crowd poll" card under the story's first post. You see the split only after you vote.
- **X:** a native poll posted as a **reply** under the story's head tweet, open for 3 days.
- **Threads:** a native poll as a **standalone post** with the story link. The app has no `threads_manage_replies`, so it can't reply.

Spec: `docs/superpowers/specs/2026-10-03-realufo-story-polls-design.md`. Code: `worker/routes/polls.ts`, `worker/lib/xpoll.ts`, `web/src/components/PollCard.tsx`.

## Quick reference

| Task | Command |
|---|---|
| Max question length for a story | `python3 scripts/polls.py --room SLUG` |
| Put the poll live on the site | `python3 scripts/article.py SLUG` (story already published) |
| Links + results, all stories / one story | `python3 scripts/polls.py` / `python3 scripts/polls.py SLUG` |

`polls.py` is read-only: it never writes and never prints tokens.

## 1. Write the question

Add the poll to `showcase/articles/SLUG/article.json`:

```json
"poll": {"q": "What did both crews film?", "opts": ["Balloon + payload", "Drone", "Unknown craft", "Need more data"]}
```

- The question must fit `--room` (X weighting: an emoji counts 2) and be at most 100 chars.
- 2–4 options, each 1–25 chars, all different. "Need more data" goes last.
- A newcomer must be able to pick in 2 seconds. Write it neutral: "Balloon or craft?", not "Obviously a balloon?".
- At most 4 options. A request that adds one to a full poll means dropping another, so ask which.
- Options are **frozen once anyone has voted**: `article.py` refuses to change, reorder or drop them. The question wording may still change.
- **Show the question and options to the user and wait for an OK** before anything posts.

## 2. Publish

- **Story already published** (its X thread is out): run `python3 scripts/article.py SLUG`. That puts the site poll live and sends IndexNow. The cron handles the social polls; no `--social` run.
- **New story:** follow the publish-article skill. Its `--social` caption then ends "<q> Vote → link". `--social` exits if that line pushes the last tweet past 280; shorten the question if so.

Nothing posts to X or Threads while `"X_POLLS"` isn't `"on"` in `wrangler.jsonc`, which must also be deployed. It is the switch for every platform. To check the deployed value:

```bash
npx wrangler deployments status --env-file /dev/null
```

```bash
npx wrangler versions view <version-id> --env-file /dev/null | grep X_POLLS
```

## 3. How the social polls go out (automatic)

The cron runs every 3 h (00, 03, … UTC). Each run posts **one** X poll and **one** Threads poll. A platform gets no new poll within 2.5 h of its last one, even when `publish.sh` fires `/__tick` every 30 s. The poll goes to the oldest story that:
- has a poll,
- whose story is already posted on that platform (the X head tweet, or the Threads mirror of the story),
- and that has no poll on that platform yet.

Each X poll costs $0.015 and counts toward `X_MONTHLY_USD_CAP`. Results are read about every 20 h, plus once after the poll closes, and show on the site as "On X: 71% Balloon · 412 votes".

## Troubleshooting (`poll_social` rows)

| What `polls.py` shows | Meaning / fix |
|---|---|
| "not posted — queued" | Normal; one poll per platform goes out every 3 h, oldest story first. If nothing posts for over 3 h, check the deployed `X_POLLS` |
| "not posted — story itself not on …" | Post the story first (publish-article `--social`). The poll follows on the next run after that |
| `pending` with an error | A network error after sending; the post may exist. Check the account by hand. Never auto-retried |
| `failed` | An API error (shown). Fix it, then `DELETE FROM poll_social WHERE slug=… AND platform=…` so the next run retries. Confirm with the user first; it's a production write |
| X 402 or 429 | The row is dropped and retried on the next run (out of credits, or rate limited) |
| "not read yet" | Normal for about the first 20 h |

## Common mistakes

- Running `--social` again to post a poll for an already-published story. That re-posts the whole story. The cron posts the poll by itself.
- Changing options after votes exist. The votes are stored as option indexes, so they would land on the wrong answers.
- Reading live counts from X or Threads with secrets. The cached counts from `polls.py` are enough.
- The X link is `x.com/realufoorg/status/ID`. The Threads handle is `@realufo_org`; take the permalink from `polls.py`.
