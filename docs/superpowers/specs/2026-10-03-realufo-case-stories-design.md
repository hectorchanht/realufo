# RealUFO — Fold the 12 case stories into realufo.org (SEO strategic sub-project C, batch 1)

Date: 2026-10-03 · Status: approved design, pending spec review

## Why

Goal (user): search traffic, concentrated on one domain. release.realufo.org (the older Astro site,
repo `war-gov-ufo-release` → GitHub `hectorchanht/gov-ufo-archive`, Cloudflare Pages) holds 46
long-form incident stories (~1,100 words each). realufo.org's 12 `/case/<slug>` pages are thin (~200
words) and every one has a matching story on the subdomain. Moving the stories onto the case pages,
with 301s from the old URLs, fixes the thin pages and moves the subdomain's link equity to the main
domain. Sub-project C of four (A release tracker and B topic hubs shipped; D backlinks).

User decisions (2026-10-03):
- **Batch 1 = the 12 case stories** (roswell, kaikoura, jal-1628, tehran, socorro, travis-walton,
  shag-harbour, ohare-2006, stephenville, trans-en-provence, manises, falcon-lake). The other 34
  stories, glossary, timeline and country overviews are later batches.
- **Stories live in a code file** (`worker/lib/caseStories.ts`), structured, not HTML blobs.
- **Redirects: 301s in the subdomain's `_redirects`** (old repo), not canonicals or zone rules.

Constraint: the stories came from the same prototype whose case ledes had factual errors (fixed in
migration 0016), and they contain "Verbatim" quotes. Per the owner's research-first rule, every claim
and quote is **fact-checked against primary documents before it moves**; nothing is copied as-is.

## Design

### Content model `worker/lib/caseStories.ts` (pure, no imports)

```ts
export interface StorySource { id?: string; url?: string; page?: number; note: string }
// id = realufo.org record (links /doc/<id>?p=<page>); url = outside source. Exactly one of id/url.
export interface StorySection { heading: string; paras: string[]; quote?: { text: string; who: string; src: number } }
export interface CaseStory {
  title: string;        // "<Case> <year>: <what the files show>" — page <title> and h1
  sections: StorySection[];
  timeline: { date: string; event: string; src?: number }[];
  sources: StorySource[]; // 1-based; paras cite inline as [n]
  updated: string;      // ISO date the story was fact-checked
}
export const CASE_STORIES: Record<string, CaseStory>; // keys ⊆ the 12 case slugs
export function storyWords(s: CaseStory): number;
export function citedSources(s: CaseStory): Set<number>; // [n] markers + quote.src + timeline.src
```

Validation (unit tests): every `[n]` / `src` is within `1..sources.length`; every source is cited at
least once; each source has exactly one of `id` / `url`; `page` is a positive integer when present;
`storyWords` between 600 and 1,600; `updated` is an ISO date; keys are case slugs from the batch.

`scripts/check_case_sources.py` (like `check_topic_sources.py`): every `id` exists and is live in prod
D1 and `page` ≤ its page count; every `url` returns HTTP < 400 (HEAD, falling back to GET).

### Fact-check pipeline (per story)

1. Read-only research agents (parallel) take the old story (`legacy/<archive>/<slug>.html` in the old
   repo, or the live subdomain page) and list every factual claim and quote.
2. Verify each against primary documents: realufo.org files (D1 `record_text` pages, `record_fts`),
   the subdomain's archive files (e.g. the NARA Blue Book PDFs it hosts), and national-archive
   catalogues. Quotes must match the source wording exactly; cite the PDF page.
3. Rewrite keeping only verified claims; add one explicit sentence where common lore contradicts the
   files; drop and list anything unverifiable.
4. Return the `CaseStory` entry plus an evidence list (≤ 20-word verbatim quote per source). The
   implementer spot-checks quotes and runs the check script.

**Gates:** (1) format gate — Socorro (strong US documents) and Kaikoura (foreign sources) for the user
to approve shape, tone and citation style; (2) full gate — the remaining 10, before deploy.

The existing `cases.lede` (fixed in 0016) stays as the opening paragraph; the story follows it.

### Case page (crawler HTML + SPA)

Order: coord line, **h1 = `story.title`** (falls back to `cases.name`), archive label, lede, story
sections (h2 + paragraphs; `[n]` rendered as small links to `#src-n`; a section quote as a blockquote
with "— who" and its source link), **Timeline** (dated list, `[n]` where sourced), **Evidence &
sources** (numbered, `id="src-n"`; realufo files → `/doc/<id>?p=N` with the doc title; outside →
new tab, `rel="noopener"`, domain label), "Last fact-checked: <date>", then the existing discussion
card, comments, "Start a board thread", **More cold cases**. The "Full story, timeline and sources ↗"
link to release.realufo.org is removed. A case with no story renders exactly as today.

SEO: `<title>`/h1 from `story.title`; meta description = lede (trimmed); JSON-LD `Article` gains
`headline` (story.title), `dateModified` (updated), `citation` (source URLs: doc URLs on realufo.org
and outside URLs), `about` (case name). Sitemap `/case/<slug>` entries get `<lastmod>` = `updated`.

Links in:
- **Doc pages** gain "Cited in: <story title>" (links `/case/<slug>`) for records cited by any story —
  computed from `CASE_STORIES` (no D1 change), shown with the Topics row (SSR + SPA).
- **Topic hubs**: stories citing a topic's members are added to that topic's "Related stories" (after
  articles), linking `/case/<slug>`.

### Redirects

Old repo (`/Users/laichan/code/tung/war-gov-ufo-release`):
- `src/data/stories.json`: `movedTo: "https://realufo.org/case/<slug>"` on the 12 entries.
- `src/pages/stories/[slug].astro` skips stories with `movedTo` (no static file shadows the redirect);
  the `/stories/` index and archive pages that list stories link moved ones to `movedTo`.
- `scripts/build-redirects.py` emits, before the catch-all 200 rules,
  `/stories/<slug>/ https://realufo.org/case/<slug> 301` and `/stories/<slug> https://realufo.org/case/<slug> 301`
  for every moved story; regenerate `_redirects`. Sitemaps drop the 12.
- Work on a branch; the user approves the diff before merge to `main` + push (which deploys via the
  `deploy-cf-pages.yml` GitHub Action).

Main domain: the worker's legacy redirect (`/stories/*` → release.realufo.org) sends the 12 moved slugs
straight to `/case/<slug>` (no apex → subdomain → apex chain); other slugs unchanged.

### Rollout

1. Fact-check → format gate (2) → full gate (10).
2. Deploy the main site (stories live on `/case/*`); verify.
3. Old-repo branch → user OK → merge + push → Pages deploy → verify each of the 24 old URLs (with and
   without trailing slash) answers one 301 to the right `/case/<slug>`.
4. IndexNow: the 12 case URLs + doc pages that gained "Cited in".

### Errors and edge cases

- Story missing for a case → page as today; a story key that isn't a case slug fails the unit test.
- A cited realufo record removed later → its source line still renders the note but without a doc
  link (title unknown) — rendered as plain text "realufo file <id> (no longer available)".
- Outside URL rot → check script flags it; page still renders the link.

## Testing

- **Unit** (`worker/tests/caseStories.spec.ts`): validation rules above; `citedSources`; `storyWords`.
- **Crawler HTML** (`meta.spec.ts`, with a test story injected for a seeded case or a real entry):
  h1 = story.title; sections; blockquote with source link; timeline; numbered sources (`?p=` doc
  link, outside link with `rel="noopener"`); `Article` JSON-LD with `dateModified` + `citation`; no
  subdomain story link; case without story unchanged; doc page "Cited in"; sitemap `lastmod`.
- **Redirect** (`meta.spec.ts`): apex `/stories/socorro/` → 301 `/case/socorro`; an unmoved slug →
  release.realufo.org.
- **Web**: Case renders sections / citations / timeline / sources, falls back without a story; Doc
  shows "Cited in".
- **Old repo**: test on generated `_redirects` (12 × 2 lines, before the 200 rules); its build passes.
- **After deploy**: curl the 24 old URLs → single 301 each.

## Out of scope (later batches)

The other 34 stories (incl. 14 country overviews), glossary, timeline; moving any country archive
pages (they stay on release.realufo.org and remain valid evidence links); story polls on case pages.
