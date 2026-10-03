---
name: publish-article
description: Use when the user wants a RealUFO story across several records (look-alike pairs, "same shape, different years", a case built from evidence) researched, written and published as an article on realufo.org (doc pages + Reddit-style site thread) and as an X thread mirrored to the social accounts.
---

# Publish an article (story + evidence + images)

An article = one story across several archive records, backed by evidence: each record's best **moment** (seconds into its video), a close-up **image**, and the official words. The user's bar: **entertaining, informational, fun**, and every article teaches how to check it yourself in the app.

Where it lands:
- **D1** `articles` + `article_records` (migration 0025): the story, each piece of evidence with moment, caption and image (R2 `uploads/<uuid>.jpg`).
- **Doc pages**: every record in the article shows a "LOOK-ALIKE FILES" card (side-by-side image, evidence rows that jump to the moment, link to the story). Crawler HTML gets the same links.
- **Site thread** (Reddit-style, `/thread/ar_<slug>`, by RealUFO): OP = the story + hero image; one reply per piece of evidence. A `https://realufo.org/doc/ID?t=15` link in a post embeds that record playing at that moment.
- **X thread**: the Short + first part as the head tweet, the other parts as replies (parts joined by `\n---\n`, `THREAD_SEP` in worker/lib/x.ts). Facebook, Instagram, Threads, YouTube and TikTok get the whole story as one caption; Bluesky gets the head only.

## 1. Find the story, then research it (before writing anything)

- **Research first** (user rule): read every source record in full (fullText, the PDFs), then search the web for how others covered it (news, Wikipedia, enthusiast sites) and note where popular retellings differ from the documents. That gap is often the best angle (AAWSAP: CBS omits the $21.9M; green fireballs: the "copper proof" lore contradicts the lab report). Cite outside sources to the user; quote only the documents in the article.
- Stories needn't be sightings: programmes, money and paper trails work too (warp-drives).

- Shape words in AARO's video descriptions are the best signal: `SELECT id, summary FROM records WHERE status='live' AND kind='video'` → grep "resembl", "shaped", "described the UAP as". Identical wording across files = gold (PR028/PR029: "inverted teardrop with a vertically linear trailing mass suspended below").
- Search the live API like a user would: `curl "https://realufo.org/api/records?q=teardrop&type=video"`.
- The mission reports (DOW-UAP-D…) hold the crews' own words (shape, speed, "only on SWIR", "Benign"): `GET /api/records/ID` → `fullText.pages`.
- **Look at the frames** before claiming a look-alike. Download the `full` asset and tile timestamped crops (`fps=1/3,crop=…,drawtext=%{pts\:hms},tile=4x3`).
- Explanations come from physics and AARO's own resolutions (e.g. the GoFast card on motion parallax), phrased as "consistent with" / "object or X?". Files AARO lists as unresolved stay unresolved in the copy.

Candidate pairs not yet written up:
- **Into the sea:** Puerto Rico 2013 (AARO-DOD_110692805…, solved: two objects at wind speed, never entered the water) vs DOW-UAP-PR067 ("spherical USO … in and out of water", unresolved). Thermal IR can't see under water.
- **Phone orbs:** FBI-UAP-PR003 vs PR004 (Northeast US, "plasma-like sphere", "red sphere with white sun"). Out-of-focus point light makes a blur disc that changes as autofocus hunts; the bright centre clips to white.
- **Greek sea-skimmers:** WARGOV-VID-111689011 vs 111689022.
- **Middle East 2025 spheres:** DOW-UAP-PR133 vs PR135.
- **Already a Short:** two stars, PR038 vs PR104.

## 2. Write `showcase/articles/<slug>/`

- `article.json`: `slug`, `title`, `hero`, `short`, `showcase_record` (the X post hangs off it; once per record), `parts` (X tweets, each ≤280 weighted; the first gets the doc link appended, the last gets the thread link), and `evidence` (`[{id, t?, label, evidence, image?}]`). See `teardrop-twins/article.json`.
  - Juicy points: the hook (distance/years apart), the crews' quotes, the tell (what the frames show), the physics, a bonus myth-bust, then **how to check it in the app** (search word → Video → open → tap the moment → `,` `.` step frames → read the mission report).
  - `poll`: `{q, opts}`, the story's crowd question (site poll under the story + an X poll reply under the X thread). A newcomer must be able to pick in 2 seconds: 2–4 opts ≤25 chars, "Need more data" as the safe last one, no leading wording ("Obviously a balloon?"). Opts freeze once anyone voted. **Show the question to the user before `X_POLLS` posts it.** With a poll, the social caption ends "<q> Vote → link" instead of "Full story: link".
- Images: close-ups at the moment (`crop=120:120:X:Y,scale=720:720`) and a side-by-side `hero.jpg`.
- `short.py` → `short.mp4` (git-ignored). Use `showcase/lib.py` (`Cut`, `txt`, `save(out, bed=True)` for the synthesized ambient sound). Include an app-screenshot beat: headless Chrome `--screenshot --window-size=430,932 --force-device-scale-factor=2` of `/archive?q=WORD&type=video`. Don't screenshot doc pages, they hang on the video. Don't use emoji in drawtext (Arial renders boxes).

## 3. Publish

```bash
python3 scripts/article.py SLUG            # images → R2, rows → D1, site thread, IndexNow
python3 scripts/article.py SLUG --social   # + Short and story as an X thread, mirrored everywhere (publish.sh)
```

- Re-running is safe: images (uuid5 keys), rows (upserts), the thread (made once) and the social post (once per record) are all idempotent.
- **Never post to social before the user has approved the Short and the copy** ("no post until we make it good"). The site part can go first.
- The X poll is posted by the cron (`worker/lib/xpoll.ts`), not by `--social`: one per tick, as a reply to the story's head tweet, once `X_POLLS=on` and the head tweet is posted.
- Needs migration 0025 applied and the Worker deployed with the article code (doc card + X thread replies).
