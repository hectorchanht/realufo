# RealUFO — Build Kickoff Prompt

> Paste this into a fresh project/folder to brief a coding agent. A working HTML/JS prototype (`RealUFO.dc.html`) and a flow diagram (`Data & Discussion Flow.dc.html`) exist — treat them as the source of truth for UX and visual language.

---

## Prompt

Build **RealUFO**, a mobile-first web platform that turns the declassified UFO/UAP archive into a living community. It fuses official government records (CIA/DoD/FBI/Navy releases + classic case files) with anonymous-by-default forum discussion, per-document comment threads, cold-case deep-dives, and a sightings map. A polished HTML prototype already defines every screen, interaction, and the visual system — match it.

this is a revamp to /Users/laichan/code/tung/war-gov-ufo-release which have done the crawler, and front end.
**RealUFO** will reuse the crawler and crawled data to start.
all files referenced are inside ./realufo-handoff.
you may connect to github and cloudflare to automate your git push, deployment, file uploads

### Product pillars
1. **Archive** — searchable, filterable library of declassified records (docs, images, video). Swipeable detail view.
2. **Discussion everywhere** — every record is a discussion surface. Comments are one tap, anonymous by default. Any comment (or the file itself) can be **promoted into a full board thread** that keeps a two-way reference link to the source record.
3. **Boards & threads** — standalone topic boards with credible-votes, quote-linking, and stance tags (Believer / Skeptic / Analyst / Neutral).
4. **Cold cases & map** — curated case write-ups and a sightings hotspot map with stats.

### Screens (all in the prototype)
Feed (live ticker + hot docs/threads) · Archive (search/filter/grid) · Document detail (inline discussion + promote) · Boards · Thread view · Cold Cases · Sighting Map + stats. Plus overlays: media viewer, composer (comment / reply / new thread), auth.

### The discussion → board model (important)
- Under each record: a lightweight inline comment thread + a one-tap "add comment" affordance.
- **⤴ Promote to board**: a comment becomes the opening post of a new board thread; the comment body is quoted in, and the thread stores `source_record_id`.
- **Start a board thread about this file**: opens the composer pre-attached with a file-reference chip.
- Threads show a back-reference chip to their origin record; records surface any threads promoted from them. Link is bidirectional (`posts.source_record_id ⇄ records.id`).

### Tech stack
- **Frontend**: React + Vite + TypeScript + tailwind + lucide icon. Mobile-first; responsive to a desktop layout with a **top nav bar** (not a sidebar). Inline/utility styling is fine; keep the CRT aesthetic exact. Reuse component as much as possible.
- **Backend**: Cloudflare Workers.
- **DB**: Cloudflare D1 (SQL) — schema below.
- **Storage**: Cloudflare R2 for all media (mirror everything; never hotlink origins at runtime).
- **Search**: D1 FTS for keyword + Cloudflare Vectorize for AI/RAG semantic search.
- **Auth**: anonymous by default; optional Google OAuth + email magic-link. An account only persists handle, saved files, and "you were quoted" notifications.
- **Realtime** (phase 2): live comment/post sync (Durable Objects or polling to start).

### Data model (D1)
```
records(id, agency, title, summary, doc_date, kind[pdf|image|video],
        redacted, source_url, source_site, retrieved_at, license,
        status[pending|fetched|processed|live|failed], checksum, created_at)
assets(id, record_id→records, role[thumb|full|original], r2_key, cdn_url,
        mime, width, height, bytes)
boards(id, slug, name, desc, online)
threads(id, board_id→boards, title, stance, op_body, op_handle, votes,
        source_record_id→records NULL, hot, created_at)
posts(id, thread_id→threads, body, handle NULL, stance, votes,
        source_record_id→records NULL, image_r2_key NULL, created_at)
comments(id, record_id→records, body, handle NULL, stance, votes, created_at)
sightings(id, name, lat, lng, count, case_slug NULL)
users(id, handle, email NULL, google_sub NULL, created_at)
votes(id, user_or_anon_id, target_type, target_id)   -- dedupe votes
```

### Ingest pipeline (Worker + Queues + R2)
Idempotent, checksum-deduped, status-gated. Each stage advances `records.status`; failures go to a dead-letter queue for manual re-run.
```
SEED     insert record{status:pending, source_url, license}
FETCH    pull source_url (UA + redirects) → sha256 dedupe → raw to r2:/originals → fetched
PROCESS  thumb 400w webp + full 1600w webp → r2:/thumb, r2:/full;
         pdf keeps original; video → poster frame → processed
INDEX    build FTS doc + vector embed → Vectorize → live
```
The app reads **only** your own `cdn_url` + D1 records — never an origin URL.

### Sourcing / licensing
US-government releases are public domain — mirror and attribute the originating agency. Verify licensing for any third-party imagery before mirroring; store `source_url`, `retrieved_at`, and `license` per record.

### Design system (match the prototype exactly)
- **Aesthetic**: retro declassified-terminal / CRT — space-black, phosphor-green primary, amber/red/cyan/violet accents, subtle scanlines + film grain, translucent blur-under nav. Apple-grade fluid motion (spring transitions, swipe gestures, tactile press states). No AI-slop gradients or emoji-as-icons.
- **Palette (dark)**: bg `#07080c`/`#0b0d13`, surface `#111420`, ink `#e7ecf4`, dim `#8b96a9`, faint `#525c70`; accents green `#4df0a6`, cyan `#46dfff`, amber `#ffb648`, red `#ff5d57`, violet `#b39bff`. Ship a light theme too (values in the prototype `:root`/`[data-theme="light"]`).
- **Type**: `Press Start 2P` for pixel logo/section headers (sparingly), `JetBrains Mono` for metadata/labels/chrome, `Space Grotesk` for body/reading text.
- **Accent themes** (user-switchable): phosphor / cyan / amber / violet.
- Minimum tap target 44px; respect `prefers-reduced-motion`.

### Deliverables (phase 1)
1. Scaffold repo (frontend + Worker) with the D1 schema and R2 bucket wired.
2. Seed the DB from the prototype's `data.js` dataset (records, cases, boards, threads, ticker, map points, stats).
3. Implement all 7 screens + overlays to match the prototype, including the inline-comment and promote-to-board flow.
4. Anonymous posting end-to-end; auth stubbed behind a feature flag.
5. The ingest pipeline as Worker Queues, runnable against the seed list.

Start by reading `RealUFO.dc.html` (UX + styles) and `Data & Discussion Flow.dc.html` (pipeline + discussion model), then scaffold and confirm the plan before building screens.
