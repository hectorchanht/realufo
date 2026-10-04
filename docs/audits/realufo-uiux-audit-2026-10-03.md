# RealUFO.org UI/UX + Bug Audit — 2026-10-03

Live-site QA of https://realufo.org (desktop, 1440px viewport). All interaction read-only.
Audit date: 2026-10-03. Site footer reported "564 FILES · 9 ARCHIVES", releases 01–06 (May–Sep 2026).

Fix order: Major first (1–5), then Minor. Suggested likely causes are marked "probably".

---

## MAJOR

### 1. RSS feed is dead
- **Where:** Footer "RSS feed" link.
- **What:** Footer links to `/rss.xml`. Clicking it navigates nowhere (no page load).
  Direct navigations to `https://realufo.org/rss.xml` fail; `https://realufo.org/rss` returns a 404 "signal lost" page.
- **Fix:** Make the feed reachable — verify the RSS route/handler exists and returns valid XML; fix the footer href.

### 2. Pagination skips page 3
- **Where:** `https://realufo.org/archive?q=washington` (123 records, 4 pages).
- **What:** Pagination buttons show `1, 2, 4` — page 3 is only reachable via the "jump to" control.
- **Fix:** Off-by-one (probably) in the pagination window logic; the missing page number should be rendered.

### 3. Board badges overlap title + description on /boards
- **Where:** `https://realufo.org/boards` (all 7 boards: uap, gov, vids, skeptic, intl, cases, meta).
- **What:** Each board badge overlays its title and description text, e.g. "/vids/videos, photos…", "/skeptikane explanations…".
- **Fix:** Badge is (probably) absolutely positioned without enough offset/padding — add margin/padding or reposition so it clears the text.

### 4. Duplicate mini-player on video page (intermittent)
- **Where:** `https://realufo.org/doc/DOW-UAP-PR067`.
- **What:** A second tiny player strip (`00:00.00 / 00:00.00`) is pinned at the viewport bottom while the main video player is already visible.
- **Fix:** The sticky mini-player should dismiss when the main player is in view (check IntersectionObserver logic / visibility condition).

### 5. Data integrity: location fields contain dates
- **Where:** Document cards and the location filter.
- **What:**
  - `DOW-UAP-D084` card shows location `6/12/26`; `DOW-UAP-D104` shows location `5/2/57` (dates parsed into the location field).
  - Location filter lists duplicates: `INDOPACOM (1)` vs `Indo-PACOM (1)`.
- **Fix:** Clean the ingestion mapping so dates don't land in the location field; normalize location naming (pick one form, dedupe).

---

## MINOR

- **"0comments" / "1comments"** — missing space between count and "comments" on doc pages.
- **Bare empty INCIDENT / LOCATION labels** on `/doc/DOW-UAP-PR067` (labels render with no value; hide when empty).
- **`/favicon.ico` 404s on every page** — add a favicon or fix the reference.
- **Count inconsistencies across the site:**
  - Shorts count (168) exceeds Video count (165) — check the counts' definitions.
  - "War.gov 445" vs "DoW (267)" — same archive, different numbers.
  - Agency naming not unified: `Spanish Air Force (BVD)` vs `Spanish Air Force (Mando Operativo Aéreo)`; `New Zealand Defence Force` vs `Royal New Zealand Air Force`; `Congress 1` vs `U.S. Congress (2)`; `NARA 8` vs `National Archives 7` in llms.txt.
  - `llms.txt` agency counts are stale (sum = 547, doesn't match site totals).
- **Header nav is icon-only** (Archive / Shorts / Boards unlabeled) — add labels or tooltips for discoverability.
- **404 page "feed" link** points to `/` (home) instead of the RSS feed.
- **Desktop empty-state copy** says "SWIPE A FILE…" — swipe copy on desktop is odd; use click/scroll wording.
- **Quoted video titles render inconsistently** (some quoted, some not).
- **Location filter values are messy:** multi-location strings in single entries, inconsistent naming (`"Detroit, MI"` vs `"Boston, Massachusetts"`), odd entries like `"Pacific Time Zone (1)"`, `"Gulf of America (1)"`.

---

## NOT TESTED / UNCERTAIN

- **Mobile (390px):** no device emulation available in this session — needs a real mobile pass (overflow, tap targets, hamburger menu).
- **DevTools console:** unavailable; favicon 404 confirmed and some thumbnail 404s seen in telemetry — some images may be broken.
- **"D/FBI Correspondence Referral"** title artifact — uncertain, worth a look.

---

## WORKING WELL (no action needed)

Homepage hero / trending / hot clips; archive search incl. clean empty state for no-match queries ("no records match. / the truth is elsewhere."); filters / sort / clear-all; PDF viewer; TL;DR + WTF-meter + metadata sections; related-media discovery; releases tracker; board/thread views; map / ask / cases / notifications pages; `/llms.txt`, `/sitemap.xml`, `/privacy`, `/terms` all return 200. Page loads ~1.5–4.5s with no visible failures.

---

## RESOLUTION (2026-10-03)

Each item checked against prod and the code before fixing.

| # | Finding | Root cause | Fix |
|---|---------|-----------|-----|
| 1 | RSS dead | Feed was live (200). Chrome **downloads** `application/rss+xml`, so the click seemed to do nothing. `/rss` was never routed. | Served as `application/xml` (Chrome shows it). `/rss`, `/feed` and `/feed.xml` serve the same feed. |
| 2 | Pager skips 3 | Not off-by-one: `pageList` put "…" in place of a single skipped page (`1 2 … 4`). | A lone gap shows its page number. |
| 3 | Board badge overlap | Full slug (`/skeptic/`, 99px) in a 44px tile overflowed onto the title. Visible in light theme and in text extraction. | Tile is now a one-letter monogram (`aria-hidden`); the slug is still printed next to the name. |
| 4 | Duplicate mini-player | No mini-player exists. On desktop the panel was 78vh tall, which pushed the video tools bar (`00:00.00 / 00:00.00` before load) to the bottom edge of the viewport, where it looked detached. | Panel capped at `min(78vh, 100dvh − 280px)`, so the tools bar sits right under the video. |
| 5 | Dates in location | Location data was clean. The card's place slot fell back to the date when there was no place (D084 `doc_date` 6/12/26; D104 location "N/A"). INDOPACOM / Indo-PACOM was a real duplicate. | Card shows the place and the date, each with its own icon (pin / calendar), and drops "N/A". Data fix in `db/fixes/2026-10-03-location-names.sql`: Indo-PACOM → INDOPACOM, Detroit MI → Detroit, Michigan, and ", United States" dropped from New Jersey and Washington State. Map aliases accept both forms. |

Minor items:
- "0comments": a text-extraction artifact (the space is in the DOM). The real bug was "1 comments", now pluralized on Doc and Case.
- Empty INCIDENT/LOCATION labels: empty cells are now left out, and an odd last cell spans the row.
- `/favicon.ico`: added (16/32/48 px, from icon-192).
- 404 "feed" link: relabeled "home", which is where it goes.
- Desktop "swipe" copy: fine pointers now see "open a file, ← → to flip through".
- Wrapped quotes: 49 war.gov video titles were wrapped in quotes. The wrapping quotes are stripped for display (web + SSR); quotes inside a title stay.
- Kept as is:
  - Shorts 168 > videos 165: Shorts include hand-made showcase cuts.
  - War.gov 445 vs DoW 267: archive and agency are different dimensions (war.gov also hosts FBI/NASA files).
  - llms.txt lists hub pages only (≥5 files), so its counts don't add up to the total.
  - The agency duplicates the audit named were already merged by `2026-10-03-agency-location-cleanup`.
  - Icon-only nav already has tooltips + sr-only labels (icons-first by design).
  - "Pacific Time Zone" / "Gulf of America" / "D/FBI" are the source's own words.
