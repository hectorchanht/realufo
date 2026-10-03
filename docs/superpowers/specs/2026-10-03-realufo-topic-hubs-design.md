# RealUFO — Topic hubs (SEO strategic sub-project B)

Date: 2026-10-03 · Status: approved design, pending spec review

## Why

Goal (user): search traffic. Release/agency/location/decade hubs cover "which batch / who / where /
when". Research queries ("AAWSAP DIRD documents", "Project Blue Book files", "Apollo UFO
transcripts", "police UFO video", "FBI flying disc file") have no landing page. Topic hubs group files
across releases and spread internal links across doc pages. Sub-project B of four (A release tracker
shipped; C fold release.realufo.org stories; D backlinks).

User decisions (2026-10-03):
- Membership: **rules in a code registry** (title/summary words, agency) **plus explicit include /
  exclude IDs** (option 1a). New matching files join automatically.
- Each topic has a **hand-written, researched background checked against the files** (option 2a),
  with page-cited sources and an optional "where the lore differs" line.
- First batch: **all 10 topics** in the appendix.

## Design

### Registry `worker/lib/topics.ts` (pure, no imports)

```ts
export interface TopicRule {
  title?: string[];      // any: title LIKE %word% (case-insensitive)
  summary?: string[];    // any: summary LIKE %phrase%
  agencies?: string[];   // any: agency = value
  notTitle?: string[];   // none: title NOT LIKE %word%
}
export interface TopicSource { id: string; page?: number; note: string }
export interface TopicEntry {
  slug: string;          // URL: /topic/<slug>
  label: string;         // short chip label ("AAWSAP & DIRDs")
  title: string;         // page title stem ("AAWSAP & the DIRD Reports")
  rule: TopicRule;
  include?: string[];    // record ids added (must exist and be live)
  exclude?: string[];    // record ids removed
  background: string;    // 2–4 sentences, every claim backed by `sources`
  lore?: string;         // optional "where the lore differs" sentence
  sources: TopicSource[];// 2–5 archive files (page = PDF page, for ?p=N deep links)
}
export const TOPIC_HUBS: TopicEntry[];
export function topicWhere(rule: TopicRule): { sql: string; binds: string[] } // over alias r
```

- A file belongs when it is live and matches **any** of `title` / `summary` / `agencies`, and none
  of `notTitle`; then `include` ids are added and `exclude` ids removed.
- `topicWhere` builds a parameterised predicate (`(r.title LIKE ? OR r.summary LIKE ? OR r.agency IN
  (SELECT value FROM json_each(?))) AND r.title NOT LIKE ?`); words become bound `%word%` values,
  never string-concatenated SQL. SQLite `LIKE` is case-insensitive for ASCII, which covers every rule.
- An entry with no positive rule and no `include` is invalid; a unit test asserts every registry entry
  is valid and slugs are unique.

### Membership: one source of truth

`topicMembers(env, origin): Promise<Record<string, string[]>>` (in `worker/routes/hubs.ts` next to
`listHubs`) runs one `SELECT r.id FROM records r WHERE r.status='live' AND <topicWhere>` per topic,
applies include (only ids that exist and are live) / exclude, and is memoized 1 h with `cachedJson`
under `${origin}/__topics`. Every consumer reads this map: hub counts, the topic hub's record query
(`r.id IN (SELECT value FROM json_each(?))`), and doc-page topic links. No second (JS) copy of the
matching rules.

### Hub plumbing

- `HubKind` gains `"topic"` in `worker/lib/hubs.ts` (`HUB_KINDS`) and `web/src/api/types.ts`.
  Every kind-keyed table gets a topic entry: `KIND_LABEL` / `KIND_PLURAL` (Hub.tsx), `KIND_HEADING`
  (ssr.ts), Browse `KINDS`, footer `GROUPS`, llms.txt `KINDS`, and any `Record<HubKind, …>`.
- `listHubs` adds `{ kind: "topic", slug, label, count }` for each topic with `count ≥ MIN_HUB_FILES`
  (5). Order in `/api/hubs`: release, **topic**, agency, location, decade.
- `hubTitle` for topics: `${entry.title}: ${count} Declassified UFO Files`.
- `hubIntro` for topics (data line): `${n} declassified UAP files on this topic: ${kinds}.${years}`
  (same kind/year phrasing as other hubs).
- Topic hub API (`/api/hubs/topic/:slug`) adds
  `topic: { background, lore: string | null, sources: { id, page: number | null, note, title }[], stories: { slug, title, threadId: string | null }[] }`:
  - `sources[].title` = `docTitle()` of the live record; a source whose record is missing or not live
    is dropped.
  - `stories` = articles with ≥1 file in the topic:
    `SELECT DISTINCT a.slug, a.title, a.thread_id FROM articles a JOIN article_records ar ON ar.slug=a.slug WHERE ar.record_id IN (SELECT value FROM json_each(?)) ORDER BY a.created_at DESC`.
  - The topic block is absent on other kinds.

### Topic page (crawler HTML + SPA)

Top to bottom: title (h1), background paragraph, lore line (if any, prefixed "Where the lore
differs:"), "Sources in the archive" list (link `/doc/<id>?p=<page>` when page set, text
`<doc title> — p. N: <note>`), data line, AI highlights (existing block, once generated), "Related
stories" (links to `/thread/<threadId>`, hidden when empty), files grid, "More topics".

JSON-LD: existing `CollectionPage` + `ItemList`, plus `about: { "@type": "Thing", name: label }`.
Meta description: the background's first sentence + the data line (snippet-trimmed as today).

### Links into topics

- **Browse**: a "Topics" section first (before Releases).
- **Site footer**: a "Topics" column (from `useHubs()`, kind `topic`).
- **llms.txt**: a "Topics" section. **Sitemap**: already lists every hub — topics appear automatically
  (verify).
- **Doc pages**: record detail gains `topics: { slug: string; label: string }[]` (from the memoized
  map, in registry order); the crawler doc body and the SPA Doc facts show "Topics: A · B" linking
  `/topic/<slug>`. A failure loading the map → `topics: []` (logged), the doc page renders.

### Highlights

Migration `0031_hub_highlights_topic.sql` (number = next free at implementation time) rebuilds
`hub_highlights` with `kind IN ('release','agency','location','decade','topic')`: create
`hub_highlights_new`, copy rows, drop old, rename. After deploy run
`python3 -m ingest.highlights --only topic/<slug> …` for the 10 topics (crawler already iterates
`/api/hubs` generically).

### Content step (gate before deploy)

For each topic: research the archive files (PDF text with page numbers) plus a quick check of public
coverage; write `background` (2–4 sentences, every claim tied to a `sources` entry), `lore` only where
files contradict common lore, and 2–5 `sources` with PDF page numbers. Resolve the audit open items
(appendix). A check script (`scripts/check_topics.py` or an inline step) verifies against prod D1 that
every source id exists and is live and every `page` ≤ the file's page count (`record_text.total_pages`
or the PDF page count). **The user reviews the 10 texts before deploy.**

### Errors and edge cases

- Topic below 5 files → no hub (404), absent from Browse / footer / llms automatically.
- Topic map query failure → topic hubs fail like other hubs (crawler falls back to shell); doc pages
  render with `topics: []`.
- Source record removed → that source line dropped; background text unchanged (content review fixes).
- A file in several topics → listed on each; the doc page shows all.

## Testing

- **Unit** (`worker/tests/topics.spec.ts`): `topicWhere` output (SQL shape + binds) for each rule
  field and combinations; registry validity (unique slugs, positive rule or include, 2–5 sources,
  non-empty background); `notTitle` excludes.
- **Integration** (seeded DB + inserted test records): a test topic registry entry (or test records
  matching a real entry, e.g. 5 inserted `AAWSAP DIRD` titles) → `/api/hubs` lists `topic/<slug>`;
  `/api/hubs/topic/<slug>` returns members, `topic.background`, sources (dropping a missing one),
  related stories from an inserted article; include/exclude honoured; doc detail `topics` lists the
  topic for a member and `[]` for a non-member; < 5 members → 404.
- **Migration**: `hub_highlights` accepts `kind='topic'` and keeps existing rows (insert + select in a
  test after migrations).
- **Crawler HTML** (`meta.spec.ts`): topic page has h1 title with count, background, sources links with
  `?p=`, stories, `"about"` JSON-LD; doc page has the Topics row; sitemap includes `/topic/`.
- **Web**: Hub renders background / lore / sources / stories only for topics; Browse has a Topics
  section first; Doc shows the Topics row; footer has a Topics column.
- **After deploy**: live check of 2–3 topic pages + a doc page; run topic highlights; IndexNow all
  `/topic/*` and the doc pages whose facts changed (topic members).

## Out of scope (YAGNI)

Shape/explanation topics (orbs, balloons) — later, as hand-picked include lists; FAQ blocks on topic
pages; AI-written backgrounds; topic polls; per-topic images/OG cards.

## Appendix — membership audit (prod, 2026-10-03)

Counts are live files after include/exclude. "Open" items are resolved in the content step.

| # | slug | label | rule | include / exclude | files |
|---|---|---|---|---|---|
| 1 | `aawsap` | AAWSAP & DIRDs | title: `DIRD`, `AAWSAP`; summary: `AAWSAP` | — | 44 (D110–D153: objectives, solicitation, 5 contract mods, 37 DIRDs) |
| 2 | `mission-reports` | Mission reports (MISREPs) | title: `Mission Report`; summary: `Mission Report (MISREP)` | — | 34 |
| 3 | `flying-discs` | Flying discs, 1947–1950s | title: `Flying Disc`, `Flying Saucer`; summary: `flying disc`, `flying saucer`; notTitle: `62-HQ-83894` | — | 13 (NARA RG 18/341/342 files, CIA-UAP-002/005/D020/D021, DOW-UAP-D084/D086/D097/D100/D105) |
| 4 | `apollo-nasa` | Apollo & NASA crews | title: `Apollo`, `Gemini`, `Mercury`, `Skylab` | — | 20 (NASA-UAP-D001–D007, D016–D022, VM001–VM006) |
| 5 | `fbi-62-hq-83894` | FBI file 62-HQ-83894 | title: `62-HQ-83894` | — | 18 (sections 1–10, serials 130/153/164/220/403/438/449, Sub A) |
| 6 | `project-blue-book` | Project Blue Book | title: `Blue Book`; summary: `Project Blue Book` | — | 9 (CIA-UAP-015/019, DOW-UAP-D092/D096/D102/D103/D104/D154, DOW-UAP-PR159) |
| 7 | `police` | Police & law enforcement | agencies: `Local Law Enforcement`; title: `police`, `sheriff` | — | 8 (LLE-UAP-D001–D004, PR001–PR004) |
| 8 | `nuclear-sites` | Nuclear sites & Los Alamos | summary: `Los Alamos`, `atomic`, `nuclear` | include: DOW-UAP-D094, DOW-UAP-D017 · exclude: DOW-UAP-D126 (propulsion DIRD) · **open**: CIA-UAP-D022 (Puerto Rico 1965 — keep only if its nuclear mention is about a site) | 9 (DOE-UAP-D002–D005, DOW-UAP-D154, FBI-UAP-D011, D094, D017, CIA-UAP-D022 pending) |
| 9 | `aaro-case-resolutions` | AARO case resolutions | title: `Case Resolution` | — | 7 |
| 10 | `congress` | Congress & hearings | summary: `On March 6, 2026, eight members of the U.S. House`, `open hearing` | include: CONGRESS-CHRG-119hhrg61718, USG-UAP-D001 · exclude: 059uap00013 (Mexican Congress cable) | 55 (49 House-request videos, AARO-956955 + AARO-DOD_109584436/439/445 shown at hearings, hearing transcript, constituent correspondence) |

Overlap is expected (e.g. DOW-UAP-D154 is in Blue Book and Nuclear sites).
