# RealUFO — Hub landing pages (SEO sub-project 3)

Date: 2026-10-02 · Status: approved design (approach A), pending spec review

## Why

Goal (user): better SEO and more traffic. Sub-projects 1–2 made each doc page
crawlable and full of text. What's missing are pages that match broader
queries ("Pentagon UAP release September 2026", "FBI UFO files", "Las Vegas
UAP sightings", "1950s UFO files") and that spread link equity across the 594
doc pages. Today agency/location/release/decade only exist as Archive filter
query params (`/archive?agency=FBI`), which aren't indexable landing pages.

User picked all four hub types: releases, agencies, locations, decades, plus
a `/browse` index.

## Data reality (live facets 2026-10-02)

- Releases: 6 (R1 2026-05-08: 169 … R6 2026-09-18: 74). Clean.
- Agencies: 17 raw values with duplicates (`DoW` 191 + `Department of War`
  76; `DoS` + `Department of State`; `CIA` + `Central Intelligence Agency`).
- Locations: 79 raw values, 31 with a single file, typos (`Westen United
  States`) and variants (`Colorado Springs, Colorado` / `…, U.S.`;
  `Low Earth Orbit` / `Low-Earth Orbit`).
- Decades: 9, from `decadeOf(incident_date)` (1940s 12 … 2020s 238).

Hence: curated alias maps for agencies and locations, and a minimum size.

## Approach A — hub registry + dedicated Hub screen (user-approved)

### Registry — `worker/lib/hubs.ts`

```ts
type HubKind = "release" | "agency" | "location" | "decade";
MIN_HUB_FILES = 5
AGENCY_HUBS: { slug, label, full, values[] }[]
LOCATION_HUBS: { slug, label, values[] }[]
```

Agency hubs (`label` short, `full` used in intro/title):

| slug | label | full | values |
|---|---|---|---|
| department-of-war | Department of War | U.S. Department of War (Pentagon) | DoW, Department of War |
| fbi | FBI | Federal Bureau of Investigation | FBI |
| aaro | AARO | All-domain Anomaly Resolution Office | AARO |
| nara | National Archives | U.S. National Archives (NARA) | NARA |
| nasa | NASA | NASA | NASA |
| cia | CIA | Central Intelligence Agency | CIA, Central Intelligence Agency |
| department-of-state | Department of State | U.S. Department of State | Department of State, DoS |
| department-of-energy | Department of Energy | U.S. Department of Energy | Department of Energy |
| local-law-enforcement | Local law enforcement | Local law enforcement agencies | Local Law Enforcement |

Location hubs:

| slug | label | values |
|---|---|---|
| western-united-states | Western United States | Western United States, Westen United States |
| las-vegas-nevada | Las Vegas, Nevada | Las Vegas, Nevada |
| centcom | CENTCOM (Middle East) | CENTCOM |
| middle-east | Middle East | Middle East |
| europe | Europe | Europe |
| iraq | Iraq | Iraq |
| syria | Syria | Syria |
| arabian-gulf | Arabian Gulf | Arabian Gulf |
| northeastern-united-states | Northeastern United States | Northeastern United States |
| colorado | Colorado | Colorado, Colorado Springs, Colorado, Colorado Springs, Colorado, U.S. |
| eastern-united-states | Eastern United States | Eastern United States |
| moon | The Moon | Moon |
| yellow-sea | Yellow Sea | Yellow Sea |
| washington-dc | Washington, D.C. | Washington, D.C. |
| east-china-sea | East China Sea | East China Sea |
| pacific-ocean | Pacific Ocean | Pacific Ocean |
| greece | Greece | Greece |
| low-earth-orbit | Low Earth orbit | Low Earth Orbit, Low-Earth Orbit |
| atlantic-ocean | Atlantic Ocean | Atlantic Ocean, North Atlantic Ocean |

(The "Colorado" values are three distinct strings: `Colorado`,
`Colorado Springs, Colorado`, `Colorado Springs, Colorado, U.S.`.)

Release hubs: slug = release number (`/release/6`), from the existing
`wargovReleases(env)` (raw `doc_date` strings per release). Decade hubs:
slug `1950s`, from the existing `decadeOf(incident_date)`. Both functions
move from `worker/routes/records.ts` to an export the hub code can import
(same file, just `export`).

Values not in any alias map get no hub (Archive filters still reach them).
A hub with fewer than `MIN_HUB_FILES` live files is treated as not found
(API 404, pre-render serves plain index.html, sitemap omits it) — so a hub
appears automatically once data grows past the threshold.

### Loader

`loadHub(env, kind, slug)` → `Hub | null`:

```ts
interface Hub {
  kind: HubKind; slug: string;
  title: string;          // "Release 06 · 18 Sep 2026", "FBI UAP files", "UAP files: Las Vegas, Nevada", "1950s UAP files"
  intro: string;          // data-generated, see below
  stats: { files: number; pdf: number; video: number; image: number; from: string | null; to: string | null };
  records: ListRecordCard[];   // same card shape /api/records returns (thumb, duration included)
  siblings: { kind: HubKind; slug: string; label: string; count: number }[]; // other hubs of the same kind
  prev?: string | null; next?: string | null;   // releases only (slugs)
}
```

- All filters include `r.status='live'`. Order: `r.featured DESC, r.created_at DESC, r.id`.
- release: `r.archive='wargov' AND r.doc_date IN (<raw dates>)`.
- agency / location: `r.agency IN (...)` / `r.location IN (...)`.
- decade: select live `(id, incident_date)` and filter with `decadeOf` in
  JS (≈600 rows; ponytail note: move to a stored decade column if records
  grow past ~20k).
- `stats.from`/`to`: min/max `yearOf(incident_date)` over the hub's files.

Intro (one or two sentences, generated, unique per hub):

- release: "74 declassified UAP files the Department of War published on 18
  September 2026 (Release 06): 40 PDFs, 30 videos, 4 images. Incidents
  span 1947–2025."
- agency: "104 declassified UAP files from the Federal Bureau of
  Investigation: … Incidents span …."
- location: "37 declassified UAP files about incidents in Las Vegas,
  Nevada: …."
- decade: "29 declassified UAP files about incidents in the 1950s: …."

Type parts omit zero counts ("40 PDFs, 30 videos"), singular for 1 ("1
image"); the "Incidents span" sentence is omitted when no year is known and
reads "Incidents date from 1952." when from = to.

`listHubs(env)` → `{ kind, slug, label, count }[]` for every hub with ≥ 5
files, computed from the same grouped counts as `recordFacets` (extract
that query code into a shared helper rather than duplicating it).

`listHubs` is cached in the Workers Cache API for 1h (key
`<origin>/__hubs`, same pattern as the page-data cache), so callers below
cost no D1 on a hit.

`hubsFor(record, releaseNo, live)` → `{ agency?: slug; location?: slug;
release?: string; decade?: string }` — pure lookup in the registry (no D1)
filtered by `live`, the set of `"<kind>/<slug>"` keys from `listHubs`, so a
fact links to a hub only when that hub exists (e.g. no link for the 1980s
decade with 2 files).

### Worker surface

- `GET /api/hubs` → `{ hubs: listHubs }`.
- `GET /api/hubs/:kind/:slug` → `Hub` or 404.
- `loadRecord` adds `hubs` (from `hubsFor`) so the doc page can link facts
  to hubs.
- Pre-render (`worker/lib/pages.ts` ROUTES): `/browse`, `/release/:slug`,
  `/agency/:slug`, `/location/:slug`, `/decade/:slug`.
  - Hub body: h1 title, intro paragraph, stat line, list of all files as
    `/doc/` links, "More <kind> hubs" link list (siblings), release
    prev/next links. JSON-LD `CollectionPage` with `about` = label and
    `mainEntity` = `ItemList` of the doc URLs (positions 1..n).
  - `/browse` body: h1 "Browse the archive", one section per kind with hub
    links + counts.
  - `docBody` facts link Agency / Location / Released in / Incident date to
    their hubs when `hubs` has them.
- `wrangler.jsonc` `run_worker_first` gains `/browse`, `/release/*`,
  `/agency/*`, `/location/*`, `/decade/*`.
- Sitemap adds `/browse` and every hub URL.
- The 1h page-data cache covers pre-render; the API responses add
  `cache-control: public, max-age=300`.

### SPA

- Routes `/browse`, `/release/:slug`, `/agency/:slug`, `/location/:slug`,
  `/decade/:slug` in `web/src/router.tsx`.
- `Hub` screen: title, intro, stat chips, `DocCard` grid of all files
  (existing component), sibling hub chips, release prev/next. Not found →
  the app's existing not-found treatment.
- `Browse` screen: grouped hub chips with counts.
- Doc page: agency chip and the Location / Released meta values become
  links to their hubs when `detail.hubs` has them.
- Archive: one "Browse by release · agency · location · decade →" link to
  `/browse` near the filters.
- Queries via the existing react-query pattern in `web/src/api/queries.ts`
  (`useHub(kind, slug)`, `useHubs()`).

## Testing

- Worker unit: registry invariants (unique slugs per kind, no raw value in
  two hubs of the same kind); `hubsFor` mapping incl. aliases
  (`Department of War` → `department-of-war`) and unknown values; intro
  wording (pluralisation, zero parts omitted, single-year phrasing, no year).
- Worker integration (seeded D1): `/api/hubs/agency/fbi` lists the 5 seeded
  FBI records with correct stats; `/api/hubs/release/<n>` matches the seeded
  release; below-threshold hub → 404; unknown kind/slug → 404;
  `/api/hubs` omits below-threshold hubs; pre-render of `/agency/fbi` has h1,
  `/doc/` links and ItemList JSON-LD; `/browse` pre-render; sitemap contains
  hub URLs; doc pre-render links its agency to `/agency/fbi`.
- Web: Hub screen renders title, intro, cards, siblings; not-found state;
  Browse screen groups; Doc agency/location link to hubs when present and
  stay plain text when absent.
- Manual after deploy: curl -A Googlebot `/release/6`, `/agency/fbi`,
  `/location/las-vegas-nevada`, `/decade/1950s`, `/browse`; SPA navigation
  doc → agency hub → another doc.

## Out of scope

Editing D1 values, hand-written intro copy (the registry can grow an
optional `intro` override later), hubs for single-file values, hub pages
for boards/threads, top-nav changes.
