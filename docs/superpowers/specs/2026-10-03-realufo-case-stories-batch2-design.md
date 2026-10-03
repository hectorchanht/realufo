# RealUFO — Fold 20 incident stories + 3 agency overviews into realufo.org (SEO sub-project C, batch 2)

Date: 2026-10-03 · Status: approved design, pending spec review

## Why

Same goal as batch 1 (`2026-10-03-realufo-case-stories-design.md`): concentrate search traffic on
realufo.org by moving release.realufo.org's long-form stories onto the main domain, fact-checked,
with 301s from the old URLs. Batch 1 moved the 12 stories that had case pages. 34 stories remain:
20 incidents and 14 archive overviews.

User decisions (2026-10-03):
- **Split the overviews.** The 3 U.S. agency overviews (AARO, NARA, NASA) become the background of
  the existing `/agency/<slug>` hubs. The 11 foreign overviews (Argentina, Brazil, Canada, Chile,
  France/GEIPAN, Italy, NZ, Peru, Spain, UK, Uruguay) stay on release.realufo.org next to the country
  archives they introduce.
- **The 20 incidents become new case pages** (`/case/<slug>`), reusing batch 1 end to end.
- **Condon Committee and Robertson Panel are case pages too** (studies, not incidents; "cold cases"
  is how the site groups famous episodes).
- **The user approves all 23 texts before deploy**, sent in groups of about 5.

Moved in this batch (23):

| Old slug | New URL |
|---|---|
| belgian-wave, cash-landrum, coyne, gimbal, phoenix-lights, tic-tac, operacao-prato, trindade, varginha, el-bosque, valensole, chiles-whitted, condon-committee, levelland, lubbock-lights, mantell, mcminnville, robertson-panel, cosford, rendlesham | `https://realufo.org/case/<slug>` (same slug) |
| aaro-overview | `https://realufo.org/agency/aaro` |
| nara-overview | `https://realufo.org/agency/nara` |
| nasa-overview | `https://realufo.org/agency/nasa` |

Not moved: the 11 foreign overviews and every country archive page (they stay valid evidence links).

## Design

### Case stories (20)

- **Content:** same `CaseStory` model, validation and rendering as batch 1 (`worker/lib/caseStories.ts`,
  unchanged except the slug list). The 20 stories live in a new Worker-only file
  `worker/lib/caseStoryText2.ts` (`CASE_STORY_TEXT_2`), so the batch-1 file does not double;
  `caseStoryText.ts` spreads it into the exported `CASE_STORY_TEXT`, so every consumer (case page,
  doc "Cited in", topic/agency "Related stories", sitemap lastmod, apex redirect) picks the new
  stories up with no change.
- **`CASE_SLUGS`** grows from 12 to 32 (the 20 slugs above).
- **Case rows:** migration `0034_cases_batch2.sql` inserts the 20 `cases` rows. Columns:
  - `slug`, `name` (e.g. "Levelland 1957", "Gimbal · USS Theodore Roosevelt");
  - `coord` in the existing format (`◉ <lat> · <lng> · <place> · <date>`): event location; Condon →
    Boulder, CO; Robertson → Washington, DC; Gimbal and Tic-Tac → their published offshore positions
    (from the cited sources);
  - `accent` from the existing palette (`#cbd5e1` NARA, `#4a9eff` U.S. other, `#ff6b6b` Canada,
    `#0055a4` France, `#f4c542` Spain, `#5b8def` NZ; new countries Belgium, Brazil, Chile, UK pick an
    unused palette colour each);
  - `archive_label` naming the main evidence (e.g. "NARA Archive", "UK · The National Archives");
  - `lede`: 1–2 sentences written from the checked story (not the prototype text);
  - `pull` / `pull_cite`: a verified quote from one of the story's sources (or NULL if none fits).
  The migration is applied to prod before deploy (check pending migrations first). New cases get no
  `sightings` rows (the map's dots come from file places, not cases).
- **Sources:** archive files preferred (`id` + `page`); outside primary sources allowed (`url` +
  `page` for PDFs), as in batch 1.

### Agency backgrounds (3)

- **Content:** `AGENCY_TEXT: Record<string, TopicText>` in `worker/lib/topicText.ts`, keys `aaro`,
  `nara`, `nasa`, same shape as `TOPIC_TEXT` (`background`, optional `lore`, `sources`). Sources are
  archive files only (`id` + `page`), like topic texts; a claim with no archive source is rewritten
  or cut.
- **Rendering:** the hub route builds the existing topic block for an agency hub that has an
  `AGENCY_TEXT` entry. `topicBlock` takes the text as a parameter (`TOPIC_TEXT[slug]` for topics,
  `AGENCY_TEXT[slug]` for agencies) and the agency's member ids. Crawler HTML and the SPA render the
  existing background / sources / related-stories block; agency hubs without an entry render as
  today. "Related stories" lists case stories citing the agency's files (internal links to the new
  cases). The block keeps the existing catch so a failed query cannot break the hub.
- Hub `<meta description>` for those 3 agencies = first sentence of the background + the hub intro.
  This comes free: `pages.ts` already builds it from the hub's `topic` block, which agency hubs with
  an entry now carry.

### Fact-check pipeline (per text)

As batch 1: one read-only research agent per text takes the old story
(`legacy/<archive>/<slug>.html` or `legacy/<archive>/story.html` for overviews in the old repo),
lists every claim and quote, verifies each against primary documents (realufo.org files via D1
`record_text`, the subdomain's archive files, national-archive catalogues), quotes verbatim with PDF
page, adds one explicit sentence where popular lore contradicts the documents, and drops anything
unverifiable (listed for the user). It returns the entry plus an evidence list (≤ 20-word quote per
source). I spot-check quotes and run the check scripts.

**Gate:** the user approves texts in groups of about 5 (20 stories ≈ 22,000 words + 3 backgrounds),
with lore-vs-documents points and dropped claims flagged per text. Nothing deploys before all 23 are
approved.

### Redirects

- **Old repo** (`/Users/laichan/code/tung/war-gov-ufo-release`), in a fresh worktree of `origin/main`
  (the main checkout is on another session's branch; leave it alone):
  - `src/data/stories.json`: `movedTo` on the 23 entries (targets in the table above).
  - `URL-CONTRACT.txt`: drop the 23 moved story URLs.
  - Batch 1's tooling does the rest: `build_moved_block()` emits two 301s per moved story before the
    200 rules; `[slug].astro`, the stories index, Nav and Footer already honour `movedTo`.
  - `scripts/test_moved_stories.py` expects 35 moved stories / 70 rules, all before the 200 block.
  - Push to `main` (deploys via the GitHub Action) only after the main site is live and verified.
- **Main domain:** the apex `/stories/<slug>` redirect already sends any `CASE_STORY_TEXT` key to
  `/case/<slug>`, so the 20 are covered. Add the 3 overview slugs: `aaro-overview` → `/agency/aaro`,
  `nara-overview` → `/agency/nara`, `nasa-overview` → `/agency/nasa` (one 301, no subdomain hop).

### Rollout

1. Fact-check → user approves the 23 texts in groups.
2. Apply migration 0034 to prod; deploy the main site; verify the 20 `/case/*` and 3 `/agency/*`
   pages return 200 with the new content (page memo: wait out or purge the `__page` keys).
3. Old repo: `movedTo` + tests → push `main` → Pages deploy → fetch all 46 old URLs: each answers
   one 301 to a page that returns 200. Also the apex `/stories/<slug>` forms.
4. IndexNow: the 23 new/changed URLs plus doc pages that gained "Cited in".

### Errors and edge cases

Unchanged from batch 1: unknown slug → `Object.hasOwn` guard; a story key that is not in
`CASE_SLUGS` fails the unit test; a cited record removed later → source renders as plain text; a
case with no story renders as today; outside URL rot → check script flags it.

## Testing

- **Unit** (`worker/tests/caseStories.spec.ts`): `storyProblems` is empty for all 32 stories
  (600–1,600 words, every `[n]`/`src` within range, every source cited, exactly one of `id`/`url`,
  positive `page`, ISO `updated`, slug in `CASE_SLUGS`).
- **Source checks:** `scripts/check_case_sources.py` over all 32; `scripts/check_topic_sources.py`
  also reads `AGENCY_TEXT` (ids live, page ≤ page count).
- **Hub** (`worker/tests`): `/agency/aaro` crawler HTML and `/api/hubs/agency/aaro` include the
  background, sources and a related case story; an agency without an entry is unchanged.
- **Case** (`meta.spec.ts`): one new case page renders story h1, sections, sources.
- **Redirect** (`meta.spec.ts`): apex `/stories/aaro-overview/` → 301 `/agency/aaro`; `/stories/gimbal`
  → 301 `/case/gimbal`.
- **Old repo:** `test_moved_stories.py` (70 rules before the 200 block); `npm run build` passes.
- **After deploy:** the checks in Rollout steps 2–3.

## Out of scope

The 11 foreign overviews and the country archive pages; glossary and timeline pages; story polls
on case pages; new `sightings` rows for the new cases.
