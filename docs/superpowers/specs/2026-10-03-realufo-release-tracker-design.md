# RealUFO — Release tracker + richer release pages (SEO strategic sub-project A)

Date: 2026-10-03 · Status: approved design, pending spec review

## Why

Goal (user): search traffic. The 2026-10-03 SEO audit found Google indexes only the homepage, and the
release queries are owned by uapbrowser.com (release pages titled "Sixth Pentagon UFO File Release
(September 18, 2026): 75 files", FAQ blocks) and news sites. Two easy-to-win queries:

- "next UFO file release date" / "release 7": no page answers it well anywhere.
- "Pentagon UFO files release N" / "what's new in the sixth release": realufo's `/release/N` hubs
  exist but say little beyond an intro and the file list.

This is sub-project A of four strategic items (B topic hubs, C fold release.realufo.org stories into
the main domain, D backlinks). Each gets its own spec.

User decisions (2026-10-03):
- Next-release estimate: **a labelled window computed from past gaps** (option 1a), not a forecast,
  no manual override.
- "Guess the next release" game: **a Spec 9 story poll per release** (date buckets, native X/Threads
  poll). **Ship A first without it**; the poll is a follow-up once Spec 9 is built.

## Data facts (prod, 2026-10-03)

| Release | Date | Weekday | Files | Gap |
|---|---|---|---|---|
| 01 | 2026-05-08 | Fri | 169 | — |
| 02 | 2026-05-22 | Fri | 56 | 14 |
| 03 | 2026-06-12 | Fri | 69 | 21 |
| 04 | 2026-07-10 | Fri | 36 | 28 |
| 05 | 2026-08-07 | Fri | 41 | 28 |
| 06 | 2026-09-18 | Fri | 74 | 42 |

Releases are the `wargov` archive grouped by `doc_date` (`wargovReleases()` in `worker/lib/facets.ts`).
Agency values inside releases are mixed spellings ("DoW" + "Department of War", "CIA" + "Central
Intelligence Agency") plus one-offs ("IC", "U.S. Government", "Office of the Director of National
Intelligence", "Executive Office of the President").

## Design

### Pure module `worker/lib/releases.ts`

No D1 access; everything unit-testable.

```ts
type ReleaseRow = { no: number; date: string /* ISO */; raw: string[] /* doc_date values */ };
type CountRow = { doc_date: string; agency: string | null; kind: string; n: number };

interface ReleaseInfo {
  no: number; date: string; weekday: string;           // "Friday"
  files: number; gap: number | null;                    // days since previous release
  agencies: { label: string; slug: string | null; count: number }[]; // desc by count
  kinds: { pdf: number; video: number; image: number };
  newAgencies: string[];                                // labels not in any earlier release
}

interface NextWindow {
  next: number;                                         // next release number
  earliest: string; likely: string; latest: string;     // ISO dates
  state: "ahead" | "due" | "overdue";
  daysSince: number; longestGap: number; medianGap: number;
  sameWeekday: string | null;                           // "Friday" while every release shares it
}

type FaqItem = { q: string; a: string; link?: { href: string; text: string } };

releaseSeries(releases: ReleaseRow[], rows: CountRow[]): ReleaseInfo[]
nextWindow(series: ReleaseInfo[], today: string /* ISO, UTC */): NextWindow | null
trackerFaq(series: ReleaseInfo[], win: NextWindow | null): FaqItem[]
releaseFaq(r: ReleaseInfo, series: ReleaseInfo[], win: NextWindow | null, picks: { id: string; title: string }[]): FaqItem[]
```

Rules:
- **Agency merge**: a raw value maps to its `AGENCY_HUBS` entry (label + slug) when one lists it;
  otherwise it is shown as-is with `slug: null`. Null/empty agency → "Unknown agency".
- **Window**: `earliest = last + min(gaps)`, `likely = last + median(gaps)`, `latest = last + max(gaps)`.
  When every release falls on the same weekday (`sameWeekday`), each date snaps to the nearest such
  weekday. Median of an even count = mean of the middle two, rounded to whole days.
- **State**: `today < earliest` → `ahead`; `earliest ≤ today ≤ latest` → `due`; `today > latest` →
  `overdue`. With fewer than 2 releases there are no gaps and `nextWindow` returns `null`.
- **FAQ** answers are written from the data only (same rule as hub intros; no AI text). The notable-
  files answer uses the existing hub-highlight picks, which `highlightsOf()` already re-checks
  against the release's records, and is omitted when there are none.

### Tracker page `/releases`

- **Title**: "Pentagon UFO File Releases: Dates, Schedule & Next Release". Meta description states the
  release count, total files, latest release and the window.
- **Status box** by state:
  - `ahead`: "Release 07: no date announced. If the pattern holds: Fri 2 Oct – Fri 30 Oct 2026, most
    likely around Fri 16 Oct."
  - `due`: "Release 07 is due any day: we're inside the expected window (Fri 2 Oct – Fri 30 Oct),
    most likely around Fri 16 Oct. No date announced."
  - `overdue`: "Release 07 is overdue: N days since Release 06; the longest gap so far was 42 days.
    No date announced."
  - `null` window: "Release schedule not established yet."
  - Always followed by one line on how it's computed ("Based on the gaps between past releases:
    14–42 days, median 28.").
- **Table**: Release (link to `/release/N`), date with weekday, files, gap, agencies (top 3 + "…").
- **Quick facts**: N releases, total files, median gap, "every release so far landed on a Friday"
  (only while `sameWeekday` is set).
- **FAQ** (`trackerFaq`): When is the next UFO file release? How many UFO files have been released?
  How often are they released? What day of the week? Where do the files come from? (links to
  https://www.war.gov/UFO/) What was in the latest release? (links to its page)
- **JSON-LD**: `CollectionPage` with an `ItemList` of the releases (url, name, datePublished) and a
  `FAQPage` with the FAQ items.
- **Linked from**: site footer "Explore" ("Release tracker"), `/browse`, every release page.

### Release pages `/release/N` (additions)

- **Title**: "Pentagon UFO Files Release 06 (18 Sep 2026): 74 Files". The short chip label
  (`releaseLabel`, "Release 06 · 18 Sep 2026") is unchanged for chips, footers and link lists.
  Meta description: files, date, top agencies.
- **"What's new in Release 06"** list: size vs previous ("74 files, +33 on Release 05"; Release 01 says
  "the first release"), agency breakdown with counts (hub links where a slug exists), kind
  breakdown, and "First release with files from X" when `newAgencies` is non-empty.
- **Prev / next**: "← Release 05 (7 Aug)" / "Release 07 (date) →" for past releases; on the newest,
  the next slot reads "Release 07: expected 2–30 Oct →" linking to `/releases` (or "overdue" /
  "due any day" per state).
- **FAQ** (`releaseFaq`): When was Release 06 published? How many files are in it? Which agencies?
  What are the notable files? (from picks, else omitted) When is the next release? (→ `/releases`)
- **JSON-LD**: existing `CollectionPage` + `ItemList`, plus `FAQPage`.
- The existing intro, AI highlights and file list are unchanged.
- Other hub kinds (agency, location, decade) are unchanged.

### Data flow and routes

- One grouped query, `SELECT doc_date, agency, kind, count(*) n FROM records WHERE archive='wargov'
  AND status='live' GROUP BY 1,2,3` (~6 × 15 rows), plus `wargovReleases(env)`, wrapped in
  `cachedJson(`${origin}/__releases`)` (1 h, same as `listHubsCached`). A new drop appears within the
  hour; "today" is the Worker clock (UTC), so the state can lag by at most that hour.
- `GET /api/releases` → `{ series: ReleaseInfo[], window: NextWindow | null, faq: FaqItem[] }`.
- `GET /api/hubs/release/:n` (existing) gains `release: { prev, next, whatsNew, faq }` for release
  hubs only (`prev`/`next` as `{ no, date, label } | null`, `whatsNew` = the `ReleaseInfo` plus
  `delta` vs previous, and the window for the newest).
- Crawler HTML: new `/releases` loader in `worker/lib/pages.ts`; the existing release hub loader and
  `hubBody` render the new blocks. Same objects as the API, so crawler and SPA say the same things.
- `/releases` added to `sitemap.xml` and `llms.txt`.

### SPA

- New `web/src/screens/Releases.tsx` + `/releases` route (`useReleases()` query).
- `web/src/screens/Hub.tsx` renders What's new, prev/next and FAQ when `data.release` is present.
- Footer "Explore" and `/browse` link to `/releases`.

### Errors and edge cases

- Fewer than 2 releases → no window, status "Release schedule not established yet", FAQ skips the
  next-release item's estimate (answers "No date has been announced").
- A release mid-ingest shows its live counts; no special handling.
- A release hub with no highlight picks → notable-files FAQ item omitted.
- `/api/releases` D1 failure → 500 like other routes; the `/releases` crawler loader falls back to
  the plain tab body (title + description) rather than erroring the page.

## Testing

- **Unit** (`worker/tests/releases.spec.ts`), fixtures = the six real release dates:
  - gaps 14/21/28/28/42; median 28; window Fri 2 Oct / Fri 16 Oct / Fri 30 Oct.
  - state per `today`: 2026-09-25 → `ahead`, 2026-10-03 → `due`, 2026-11-05 → `overdue` with
    `daysSince` 48.
  - weekday snapping turns off when one release is on another weekday.
  - agency merge ("DoW" + "Department of War" → one entry with hub slug; "IC" kept with null slug).
  - `newAgencies` for Release 06 = ["Local law enforcement"].
  - FAQ wording for each state; notable-files item omitted with no picks; `< 2` releases → null window.
- **Worker** (`worker/tests/meta.spec.ts`): `/releases` crawler HTML has the status, table, FAQ and
  `FAQPage` JSON-LD; `/release/6` has What's new, prev link, FAQ and the new title.
- **Web**: `Releases.tsx` renders status/table/FAQ from mocked `/api/releases`; `Hub.tsx` renders the
  release blocks only when `data.release` is present.
- **After deploy**: check live `/releases` and `/release/6`; submit them and all release pages to
  IndexNow.

## Out of scope (YAGNI)

- The guess-the-date poll (follow-up on Spec 9).
- A manual announced-date override.
- Auto social post when a release drops.
- What's-new / FAQ blocks on agency, location and decade hubs.
- Per-release change tracking beyond counts (e.g. "files removed since").
