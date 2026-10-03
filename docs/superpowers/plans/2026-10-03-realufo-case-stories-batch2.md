# Case Stories Batch 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move 20 incident stories (new `/case/<slug>` pages) and the AARO/NARA/NASA overviews (backgrounds on `/agency/<slug>`) from release.realufo.org onto realufo.org, fact-checked, with 301s from the old URLs.

**Architecture:** Batch 1's story pipeline is reused unchanged: 20 more `CaseStory` entries in a second Worker-only file merged into `CASE_STORY_TEXT`, plus 20 `cases` rows via migration. Agency hubs reuse the topic background block: `AGENCY_TEXT` (same `TopicText` shape) feeds `topicBlock` for agency hubs. Old repo only gains `movedTo` data; its batch-1 tooling emits the 301s.

**Tech Stack:** Cloudflare Worker + D1 (TypeScript, vitest with `cloudflare:test`), Python check scripts, Astro old repo on Cloudflare Pages.

**Spec:** `docs/superpowers/specs/2026-10-03-realufo-case-stories-batch2-design.md` (batch 1: `docs/superpowers/specs/2026-10-03-realufo-case-stories-design.md`)

## Global Constraints

- Moved incidents (slug unchanged → `https://realufo.org/case/<slug>`): `belgian-wave, cash-landrum, coyne, gimbal, phoenix-lights, tic-tac, operacao-prato, trindade, varginha, el-bosque, valensole, chiles-whitted, condon-committee, levelland, lubbock-lights, mantell, mcminnville, robertson-panel, cosford, rendlesham`.
- Moved overviews: `aaro-overview` → `https://realufo.org/agency/aaro`, `nara-overview` → `/agency/nara`, `nasa-overview` → `/agency/nasa`. The 11 foreign overviews and all country archive pages are NOT moved.
- Nothing is copied from the old stories as-is: every claim and quote is verified against a primary document; quotes match source wording exactly and cite the PDF page; unverifiable claims are dropped and listed; lore contradicted by files gets one explicit sentence.
- Case stories: `CaseStory` model, 600–1,600 words, every `[n]`/`src` in range, every source cited, exactly one of `id`/`url` per source. Archive files preferred; outside primary sources allowed.
- Agency texts: `TopicText` shape; sources are archive files only (`id` + `page`).
- The user approves all 23 texts, in groups of about 5, before deploy. The old-repo push needs the user's OK and happens only after the main site is live and verified.
- The SPA must never import `worker/lib/caseStoryText.ts` or `worker/lib/caseStoryText2.ts`.
- Old repo work happens in a fresh worktree of `origin/main`; never touch its main checkout (another session's branch `quick/261001-p8k-wargov-release-05-06`).
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; stage only files you touched (other sessions share this checkout).
- Worker tests: `npx vitest run -c worker/vitest.config.ts <files>` (repo root, node 22: `export PATH="/Users/laichan/.nvm/versions/node/v22.22.0/bin:$PATH"`). Typecheck: `npx tsc --noEmit -p .` (root) and `cd web && npx tsc --noEmit -p .`.

## Review Focus

- `/agency/<slug>` for an agency with no `AGENCY_TEXT` entry (e.g. fbi) must render exactly as today: no empty background, no `topic` field — pinned in Task 1.
- An `AGENCY_TEXT` source whose file is missing or not live must be dropped, not rendered as a dead `/doc/` link — pinned in Task 1.
- The apex `/stories/tic-tac/` test currently expects a subdomain redirect; once tic-tac moves it must 301 once to `/case/tic-tac`, while an unmoved slug (`uk-overview`) still goes to release.realufo.org — pinned in Tasks 2 and 3.
- Migration 0034's rows must coexist with the test seed's 12 cases (seed runs after migrations; a slug overlap would break every test file) and every `CASE_SLUGS` slug must have a row with name, coord and lede — pinned in Task 5.
- A moved overview's legacy `.html` path must redirect straight to `movedTo` (no `/stories/<slug>/` hop) — pinned in Task 7.

## File Structure

- `worker/lib/topicText.ts` — gains `AGENCY_TEXT` (Task 1 empty, Task 4 content).
- `worker/routes/hubs.ts` — `topicBlock` takes the text; `loadHub` builds the block for agency hubs with an entry.
- `worker/index.ts` — apex redirect for the 3 overview slugs.
- `worker/lib/caseStoryText2.ts` (new) — the 20 stories (`CASE_STORY_TEXT_2`).
- `worker/lib/caseStoryText.ts` — merges `CASE_STORY_TEXT_2` into `CASE_STORY_TEXT`.
- `worker/lib/caseStories.ts` — `CASE_SLUGS` grows to 32.
- `scripts/check_case_sources.py` — reads both story files.
- `db/migrations/0034_cases_batch2.sql` (new) — 20 `cases` rows.
- Tests: `worker/tests/hubs.spec.ts`, `worker/tests/meta.spec.ts`, `worker/tests/caseStories.spec.ts`, `worker/tests/cases.spec.ts`.
- Old repo: `src/data/stories.json`, `URL-CONTRACT.txt`, `scripts/test_moved_stories.py`, regenerated `_redirects`.
- Research results: `.superpowers/sdd/2026-10-03-realufo-case-stories-batch2/research/<slug>.md` (git-ignored; survives compaction).

## Research groups (approval groups)

- **G1** (Blue Book era): mantell, chiles-whitted, lubbock-lights, mcminnville, levelland
- **G2** (studies + 1970s–90s U.S.): robertson-panel, condon-committee, coyne, cash-landrum, phoenix-lights
- **G3** (Navy videos + Europe): gimbal, tic-tac, belgian-wave, cosford, rendlesham
- **G4** (France + South America): valensole, trindade, operacao-prato, varginha, el-bosque
- **G5** (agency overviews): aaro, nara, nasa

**Kick-off (before Task 1):** dispatch G1's 5 research agents in the background (brief in Task 3 Step 1), then work Tasks 1–2 while they run. Dispatch each next group when the previous group's results are saved.

---

### Task 1: Agency backgrounds on agency hubs

**Files:**
- Modify: `worker/lib/topicText.ts`, `worker/routes/hubs.ts:95-96, 193`
- Test: `worker/tests/hubs.spec.ts`

**Interfaces:**
- Consumes: `TopicText`, `TopicBlock` from `worker/lib/topics.ts`; `TOPIC_TEXT`.
- Produces: `export const AGENCY_TEXT: Record<string, TopicText>` (keys `aaro`, `nara`, `nasa` after Task 4); `topicBlock(env: Env, text: TopicText | undefined, members: string[]): Promise<TopicBlock>`.

- [ ] **Step 1: Write the failing test** — append to `worker/tests/hubs.spec.ts` (add `import { AGENCY_TEXT } from "../lib/topicText";` at the top):

```ts
describe("agency backgrounds", () => {
  it("an agency with AGENCY_TEXT carries the background block; missing sources drop; others unchanged", async () => {
    const { id } = (await env.DB.prepare("SELECT id FROM records WHERE agency='AARO' AND status='live' LIMIT 1").first<{ id: string }>())!;
    AGENCY_TEXT.aaro = {
      background: "AARO is the Pentagon office for UAP reports. It began in 2022.",
      sources: [{ id, page: 1, note: "Fixture source" }, { id: "NOPE-UAP-X999", page: 1, note: "Missing file" }],
    };
    try {
      const h: any = await (await call("/api/hubs/agency/aaro")).json();
      expect(h.topic.background).toBe(AGENCY_TEXT.aaro.background);
      expect(h.topic.sources.map((s: any) => s.id)).toEqual([id]);
      const html = await (await call("/agency/aaro")).text();
      expect(html).toContain("AARO is the Pentagon office for UAP reports.");
      expect(html).toContain("Sources in the archive");
      expect(html).not.toContain("NOPE-UAP-X999");
      const fbi: any = await (await call("/api/hubs/agency/fbi")).json();
      expect(fbi.topic).toBeUndefined();
    } finally {
      delete AGENCY_TEXT.aaro;
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run -c worker/vitest.config.ts worker/tests/hubs.spec.ts -t "agency backgrounds"`
Expected: FAIL — `AGENCY_TEXT` is not exported (undefined), or `h.topic` undefined.

- [ ] **Step 3: Implement**

`worker/lib/topicText.ts` — append after `TOPIC_TEXT`:

```ts
// Agency hub backgrounds (spec 2026-10-03-realufo-case-stories-batch2-design):
// the AARO/NARA/NASA overviews moved from release.realufo.org. Same shape and
// rules as topic texts: every source is an archive file (PDF page = ?p=).
export const AGENCY_TEXT: Record<string, TopicText> = {};
```

`worker/routes/hubs.ts`:
- import: `import { AGENCY_TEXT, TOPIC_TEXT } from "../lib/topicText";`
- signature + first line of `topicBlock`:

```ts
async function topicBlock(env: Env, text: TopicText | undefined, members: string[]): Promise<TopicBlock> {
  const srcIds = (text?.sources ?? []).map((s) => s.id);
```

  (delete the old `const text = TOPIC_TEXT[slug];` line; add `type TopicText` to the existing `./topics`/`../lib/topics` type import).
- in `loadHub`, replace the topic spread line with:

```ts
    ...(me.kind === "topic" ? { topic: await topicBlock(env, TOPIC_TEXT[me.slug], (sel as { members: string[] }).members) } : {}),
    ...(me.kind === "agency" && Object.hasOwn(AGENCY_TEXT, me.slug)
      ? { topic: await topicBlock(env, AGENCY_TEXT[me.slug], records.map((r) => r.id as string)) }
      : {}),
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run -c worker/vitest.config.ts worker/tests/hubs.spec.ts worker/tests/topics-api.spec.ts worker/tests/topics.spec.ts`
Expected: PASS (all). If `/agency/aaro` HTML is served from a page memo set by an earlier test in the file, move this describe to run first in the file.

- [ ] **Step 5: Commit**

```bash
git add worker/lib/topicText.ts worker/routes/hubs.ts worker/tests/hubs.spec.ts
git commit -m "feat(hubs): agency hubs carry a background block from AGENCY_TEXT

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Apex redirects for the 3 moved overviews

**Files:**
- Modify: `worker/index.ts:110-113`
- Test: `worker/tests/meta.spec.ts:217-229`

**Interfaces:**
- Consumes: nothing new. Produces: `/stories/{aaro,nara,nasa}-overview[/]` → 301 `/agency/{aaro,nara,nasa}`.

- [ ] **Step 1: Write the failing test** — in `worker/tests/meta.spec.ts`, in "old static-site paths 301 to release.realufo.org", replace the tic-tac pair with
`["https://realufo.org/stories/uk-overview/", "https://release.realufo.org/stories/uk-overview/"],`
and add a new test after it:

```ts
  it("moved overview stories 301 straight to their agency hub", async () => {
    const fakeEnv = { ...env, ASSETS: fakeAssets } as any;
    for (const [from, to] of [
      ["https://realufo.org/stories/aaro-overview/", "https://realufo.org/agency/aaro"],
      ["https://realufo.org/stories/nara-overview", "https://realufo.org/agency/nara"],
      ["https://realufo.org/stories/nasa-overview/", "https://realufo.org/agency/nasa"],
    ]) {
      const res = await worker.fetch(new Request(from), fakeEnv, createExecutionContext());
      expect(res.status).toBe(301);
      expect(res.headers.get("location")).toBe(to);
    }
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run -c worker/vitest.config.ts worker/tests/meta.spec.ts -t "overview"`
Expected: FAIL — location is `https://release.realufo.org/stories/aaro-overview/`.

- [ ] **Step 3: Implement** — in `worker/index.ts`, after the `CASE_STORY_TEXT` redirect line:

```ts
    // Overviews folded into agency hubs (spec 2026-10-03-realufo-case-stories-batch2-design).
    if (moved && Object.hasOwn(MOVED_OVERVIEWS, moved)) return Response.redirect(`${url.origin}/agency/${MOVED_OVERVIEWS[moved]}`, 301);
```

and near `LEGACY_PATH`:

```ts
const MOVED_OVERVIEWS: Record<string, string> = { "aaro-overview": "aaro", "nara-overview": "nara", "nasa-overview": "nasa" };
```

- [ ] **Step 4: Run** `npx vitest run -c worker/vitest.config.ts worker/tests/meta.spec.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add worker/index.ts worker/tests/meta.spec.ts
git commit -m "feat(redirect): apex /stories/<agency>-overview 301s to the agency hub

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The 20 case stories (groups G1–G4, user gate per group)

**Files:**
- Create: `worker/lib/caseStoryText2.ts`
- Modify: `worker/lib/caseStoryText.ts:8, 1591`, `worker/lib/caseStories.ts:19-22`, `scripts/check_case_sources.py:6`
- Test: `worker/tests/caseStories.spec.ts`, `worker/tests/meta.spec.ts`

**Interfaces:**
- Consumes: `CaseStory`, `storyProblems`, `CASE_SLUGS`.
- Produces: `export const CASE_STORY_TEXT_2: Record<string, CaseStory>` (20 keys); `CASE_STORY_TEXT` = batch 1 ∪ batch 2 (32 keys); `CASE_SLUGS` (32).

- [ ] **Step 1: Research brief** (one background read-only agent per story, model opus; dispatch a group of 5 at a time; save each result verbatim to `.superpowers/sdd/2026-10-03-realufo-case-stories-batch2/research/<slug>.md` as soon as it returns):

  > Read the old story: `/Users/laichan/code/tung/war-gov-ufo-release/<legacyPath>` (`legacyPath` from `git -C /Users/laichan/code/tung/war-gov-ufo-release show origin/main:src/data/stories.json`, entry `<slug>`; read the file with `git show origin/main:<legacyPath>`). List every factual claim and quote. Verify each against primary documents: realufo.org records (`npx wrangler d1 execute realufo-db --remote --json --command "<SELECT>"` from `/Users/laichan/code/tung/realufo-superpower`; tables `records` (id,title,agency,summary,incident_date,location), `record_text` (pages JSON; match the `n` field for the PDF page), `record_fts` for full-text search), the subdomain's archive files (`https://release.realufo.org/...`), and national-archive catalogues / official PDFs. Quotes must match the source wording exactly, with the PDF page. Write a `CaseStory` (types in `worker/lib/caseStories.ts`; model on an existing entry in `worker/lib/caseStoryText.ts`): title "<Case> <year>: <what the files show>", 3–6 sections (heading + paragraphs citing `[n]`), at most one quote per section with `src`, a dated timeline, 4–10 sources (exactly one of `id` for a realufo record, or `url` for an outside primary source; `page` = PDF page), `updated: "2026-10-03"`, 700–1,400 words, neutral and factual, one explicit sentence where popular lore is contradicted by the files. Prefer realufo.org records where they exist. Drop anything you cannot verify. Also propose the `cases` row: `name`, `coord` in the form `◉ 33.3940° N · 104.5230° W · <place> · <date>` (event location, from a cited source), `archive_label` (main evidence, e.g. "NARA Archive"), `lede` (1–2 sentences, every fact in it cited by the story). READ-ONLY — do not edit any file. Return: the TypeScript entry, the proposed row, an evidence list (per source: page + verbatim quote ≤ 20 words), and the dropped-claims list.

- [ ] **Step 2: Write the failing tests** — in `worker/tests/caseStories.spec.ts`:
  - change the `CASE_SLUGS is the batch` expectation to the 32 slugs (batch-1 12 in their current order, then the 20 in Global Constraints order);
  - rename `covers all 12 batch cases` to `covers all batch cases` (body unchanged).

  In `worker/tests/meta.spec.ts`, extend the moved-overview test's table with `["https://realufo.org/stories/gimbal/", "https://realufo.org/case/gimbal"]` and rename it `moved stories 301 straight to their new page`.

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run -c worker/vitest.config.ts worker/tests/caseStories.spec.ts worker/tests/meta.spec.ts`
Expected: FAIL — `CASE_SLUGS` has 12; `/stories/gimbal/` goes to release.realufo.org.

- [ ] **Step 4: Wire the second file**
  - `worker/lib/caseStories.ts` `CASE_SLUGS`: append the 20 slugs (Global Constraints order).
  - Create `worker/lib/caseStoryText2.ts`:

```ts
// Fact-checked case stories, batch 2 (spec 2026-10-03-realufo-case-stories-batch2-design).
// Worker-only — never import into the SPA. Merged into CASE_STORY_TEXT by caseStoryText.ts.
// Researched against primary documents 2026-10-03; reviewed by the owner before deploy.
import type { CaseStory } from "./caseStories";

export const CASE_STORY_TEXT_2: Record<string, CaseStory> = {
};
```

  - `worker/lib/caseStoryText.ts`: line 8 becomes `const BATCH_1: Record<string, CaseStory> = {`; add `import { CASE_STORY_TEXT_2 } from "./caseStoryText2";` under the type import; after the closing `};` of `BATCH_1` add:

```ts

export const CASE_STORY_TEXT: Record<string, CaseStory> = { ...BATCH_1, ...CASE_STORY_TEXT_2 };
```

  - `scripts/check_case_sources.py` line 6: `src = open("worker/lib/caseStoryText.ts").read() + open("worker/lib/caseStoryText2.ts").read()`; docstring names both files.

- [ ] **Step 5: Per group G1 → G4** — repeat:
  1. Spot-check at least 2 quotes per story yourself against the cited page text (`record_text` page or the outside PDF).
  2. Paste the group's 5 entries into `CASE_STORY_TEXT_2` (keep the proposed `cases` rows in the research files for Task 5).
  3. Run `npx vitest run -c worker/vitest.config.ts worker/tests/caseStories.spec.ts -t "every story is valid"` → PASS, and `python3 scripts/check_case_sources.py` → `ok: …` (401/403/429 warnings allowed, any 404/410/5xx fixed).
  4. Commit:

```bash
git add worker/lib/caseStoryText2.ts
git commit -m "feat(cases): fact-checked stories — <group slugs>

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

  5. **STOP — user gate.** Show the group: per story the title, section headings, quotes with sources, the lore-vs-documents sentence, the dropped claims, and the proposed lede. Wait for approval or edits; apply edits (re-run 3, commit) before the next group.

  (The first group commit also carries `caseStories.ts`, `caseStoryText.ts`, `scripts/check_case_sources.py` and both test files.)

- [ ] **Step 6: Run the full worker suite** after G4

Run: `npx vitest run -c worker/vitest.config.ts`
Expected: PASS (all files), including `covers all batch cases` and the gimbal redirect.

---

### Task 4: The 3 agency backgrounds (group G5, user gate)

**Files:**
- Modify: `worker/lib/topicText.ts` (`AGENCY_TEXT`)
- Test: `worker/tests/hubs.spec.ts`

**Interfaces:**
- Consumes: `AGENCY_TEXT` (Task 1). Produces: entries `aaro`, `nara`, `nasa`.

- [ ] **Step 1: Research** — 3 background agents (opus), one per overview, saved to the research dir:

  > Read the old overview: `git -C /Users/laichan/code/tung/war-gov-ufo-release show origin/main:legacy/<archive>/story.html` (`<archive>` = aaro / nara / nasa). List every factual claim. Verify each against files in the realufo.org archive only (`npx wrangler d1 execute realufo-db --remote --json --command "<SELECT>"` from `/Users/laichan/code/tung/realufo-superpower`; `records`, `record_text` pages, `record_fts`). Write a `TopicText` (`worker/lib/topics.ts`; model on an entry in `TOPIC_TEXT` in `worker/lib/topicText.ts`): `background` 150–350 words, plain paragraphs, what the agency is, what its files in this archive are, and what they show; optional `lore` (one or two sentences where popular belief differs from the files); `sources` 3–8 archive files `{ id, page, note }`. Every claim must be backed by a listed file; drop claims only an outside website supports. READ-ONLY. Return the entry, an evidence list (per source: page + verbatim quote ≤ 20 words) and the dropped-claims list.

- [ ] **Step 2: Write the failing test** — append to `worker/tests/hubs.spec.ts` "agency backgrounds":

```ts
  it("AARO, NARA and NASA have backgrounds", () => {
    expect(Object.keys(AGENCY_TEXT).sort()).toEqual(["aaro", "nara", "nasa"]);
    for (const t of Object.values(AGENCY_TEXT)) {
      expect(t.background.length).toBeGreaterThan(400);
      expect(t.sources.length).toBeGreaterThanOrEqual(3);
    }
  });
```

  Change the Task 1 test to save and restore the real entry: `const saved = AGENCY_TEXT.aaro;` before assigning the fixture, and in `finally`: `if (saved) AGENCY_TEXT.aaro = saved; else delete AGENCY_TEXT.aaro;`.

- [ ] **Step 3: Run to verify it fails** — `npx vitest run -c worker/vitest.config.ts worker/tests/hubs.spec.ts -t "agency backgrounds"` → FAIL (keys `[]`).

- [ ] **Step 4: Add the 3 entries** to `AGENCY_TEXT` (spot-check 2 quotes each), then run `python3 scripts/check_topic_sources.py` (it already parses the whole file) → `ok: …`.

- [ ] **Step 5: Run** `npx vitest run -c worker/vitest.config.ts worker/tests/hubs.spec.ts` → PASS.

- [ ] **Step 6: Commit**

```bash
git add worker/lib/topicText.ts worker/tests/hubs.spec.ts
git commit -m "feat(hubs): fact-checked AARO, NARA and NASA agency backgrounds

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7: STOP — user gate.** Show the 3 backgrounds, lore notes, sources and dropped claims; wait for approval; apply edits.

---

### Task 5: Migration 0034 — the 20 case rows

**Files:**
- Create: `db/migrations/0034_cases_batch2.sql`
- Test: `worker/tests/cases.spec.ts`

**Interfaces:**
- Consumes: approved stories + proposed rows (research files, as edited at the gates).
- Produces: 20 `cases` rows (prod after Task 6).

- [ ] **Step 1: Write the failing test** — append to `worker/tests/cases.spec.ts` (imports: `CASE_SLUGS` from `../lib/caseStories`; the file already seeds via `seedTestDB`):

```ts
describe("case rows", () => {
  it("every batch slug has a case row with name, coord and lede", async () => {
    const { results } = await env.DB.prepare("SELECT slug,name,coord,lede FROM cases").all<{ slug: string; name: string; coord: string; lede: string }>();
    const by = new Map(results.map((r) => [r.slug, r]));
    for (const s of CASE_SLUGS) {
      const r = by.get(s);
      expect(r, s).toBeTruthy();
      expect(r!.name && r!.coord?.startsWith("◉ ") && r!.lede, s).toBeTruthy();
    }
  });
});
```

  If `cases.spec.ts` has no `beforeAll(seedTestDB)`, add one with the same imports `cases-story.spec.ts` uses.

- [ ] **Step 2: Run to verify it fails** — `npx vitest run -c worker/vitest.config.ts worker/tests/cases.spec.ts -t "case rows"` → FAIL (`belgian-wave` missing).

- [ ] **Step 3: Write the migration** — one statement per case, values from the approved rows (accent palette: `#cbd5e1` NARA, `#4a9eff` U.S. other, `#0055a4` France, `#ff6b6b` Canada; Belgium `#fdda24`, Brazil `#009c3b`, Chile `#d52b1e`, UK `#c8102e`), `pull`/`pull_cite` NULL (section quotes carry the quotes), `status` NULL, `archive` `'nara'` when the main evidence is NARA else NULL. Escape `'` as `''`. Example shape:

```sql
-- Case stories batch 2 (spec 2026-10-03-realufo-case-stories-batch2-design):
-- 20 new cold cases whose fact-checked stories live in worker/lib/caseStoryText2.ts.
-- Ledes are written from the approved stories; every fact in them is cited there.
INSERT INTO cases(slug,name,archive,archive_label,accent,coord,lede,pull,pull_cite,status) VALUES
('levelland','Levelland 1957','nara','NARA Archive','#cbd5e1','◉ 33.5873° N · 102.3780° W · Levelland, TX · 2–3 Nov 1957','<lede>',NULL,NULL,NULL);
```

  (20 rows; slugs exactly the Global Constraints list; no batch-1 slug.)

- [ ] **Step 4: Run** `npx vitest run -c worker/vitest.config.ts` → PASS (whole suite: the seed's 12 rows still insert after the migration). Locally: `npx wrangler d1 migrations apply realufo-db --local` → applies 0034.

- [ ] **Step 5: Commit**

```bash
git add db/migrations/0034_cases_batch2.sql worker/tests/cases.spec.ts
git commit -m "feat(cases): 20 batch-2 cold cases (migration 0034)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Deploy the main site and verify

- [ ] **Step 1: Local check** — `cd web && npx vite build`; restart worker-dev after clearing `/Users/laichan/code/tung/realufo-superpower/.wrangler/state/v3/cache` (absolute-path `rm -rf`, worker-dev stopped); `curl -s http://localhost:8787/case/levelland | grep -oE "<h1>[^<]*|<h2>[^<]*" | head` shows the story h1/sections; `curl -s http://localhost:8787/agency/nara | grep -c "Sources in the archive"` → 1; screenshot `/case/gimbal` and `/agency/aaro` in the preview.
- [ ] **Step 2: Migration + deploy** — `npx wrangler d1 migrations list realufo-db --remote` (expect only 0034 pending; anything else pending → stop and ask), `npx wrangler d1 migrations apply realufo-db --remote`, then deploy from a clean worktree of HEAD: `git worktree add --detach <scratchpad>/deploy-b2 HEAD`, `pnpm install --frozen-lockfile` in root and `web/`, `pnpm run deploy` (node 22).
- [ ] **Step 3: Verify live**

```bash
for s in belgian-wave cash-landrum coyne gimbal phoenix-lights tic-tac operacao-prato trindade varginha el-bosque valensole chiles-whitted condon-committee levelland lubbock-lights mantell mcminnville robertson-panel cosford rendlesham; do curl -s -o /dev/null -w "$s %{http_code}\n" "https://realufo.org/case/$s"; done
for a in aaro nara nasa; do curl -s "https://realufo.org/agency/$a" | grep -c "Sources in the archive"; done
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://realufo.org/stories/gimbal/
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://realufo.org/stories/aaro-overview/
```

Expected: 20 × `200`; agency greps `1` (if `0`, the page memo is stale: purge `https://realufo.org/__page/agency/<a>` with `CF_PURGE_TOKEN` from `.env`, or wait ≤ 1 h); redirects `301` to `/case/gimbal` and `/agency/aaro`.
- [ ] **Step 4: Push + clean up** — `git push origin <deployed sha>:build/app-foundation`; `git worktree remove --force <scratchpad>/deploy-b2`.

---

### Task 7: Old repo — 301 the 23 story URLs (user-approved push)

**Files (worktree of `origin/main` of `/Users/laichan/code/tung/war-gov-ufo-release`):**
- Modify: `src/data/stories.json`, `URL-CONTRACT.txt`, `scripts/test_moved_stories.py`
- Regenerate: `_redirects`

- [ ] **Step 1: Worktree** — `git -C /Users/laichan/code/tung/war-gov-ufo-release fetch origin && git -C /Users/laichan/code/tung/war-gov-ufo-release worktree add --detach <scratchpad>/old-b2 origin/main`; `cd <scratchpad>/old-b2 && pnpm install --frozen-lockfile`.

- [ ] **Step 2: Write the failing test** — in `scripts/test_moved_stories.py`: `assert len(moved) == 35, f"expected 35 moved stories, got {len(moved)}"`, and inside the per-slug loop add:

```python
    hops = [l for l in lines if l.split()[1] in (f"/stories/{slug}/", f"/stories/{slug}")]
    assert not hops, f"still routed through the old story URL: {hops}"
```

  Run: `python3 scripts/test_moved_stories.py` → FAIL (`expected 35 moved stories, got 12`).

- [ ] **Step 3: Implement** — `src/data/stories.json`: add `"movedTo"` to the 23 entries (`https://realufo.org/case/<slug>` for the 20; `https://realufo.org/agency/aaro|nara|nasa` for the 3 overviews), keeping the file's formatting; `URL-CONTRACT.txt`: delete the 23 `/stories/<slug>/` lines; regenerate `python3 scripts/build-redirects.py`; build `pnpm build`.

- [ ] **Step 4: Run** `python3 scripts/test_moved_stories.py` → `ok: 35 moved stories …` and `ok: dist/_redirects matches`; `ls dist/stories/gimbal` → absent; `grep -c "realufo.org/agency/" _redirects` → ≥ 6.

- [ ] **Step 5: Commit** (old repo, detached worktree):

```bash
git add src/data/stories.json URL-CONTRACT.txt scripts/test_moved_stories.py _redirects
git commit -m "feat(stories): fold 20 incident stories and the AARO/NARA/NASA overviews into realufo.org with 301s

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

  (Add any other generated file the build/redirect script changed, e.g. the sitemap, if tracked.)

- [ ] **Step 6: STOP — show the user `git diff origin/main --stat` and the moved block of `_redirects`; wait for OK.** Then `git push origin HEAD:main`; watch the Pages Action (`GH_TOKEN=$(gh auth token --user hectorchanht) gh run watch -R hectorchanht/gov-ufo-archive`) until it succeeds.

- [ ] **Step 7: Verify the 46 old URLs**

```bash
for s in belgian-wave cash-landrum coyne gimbal phoenix-lights tic-tac operacao-prato trindade varginha el-bosque valensole chiles-whitted condon-committee levelland lubbock-lights mantell mcminnville robertson-panel cosford rendlesham aaro-overview nara-overview nasa-overview; do for p in "/stories/$s/" "/stories/$s"; do r=$(curl -s -o /dev/null -w "%{http_code} %{redirect_url}" "https://release.realufo.org$p"); t=${r#* }; echo "$p $r $(curl -s -o /dev/null -w "%{http_code}" "$t")"; done; done
```

Expected: every line `301 <realufo.org target> 200`. Remove the worktree after.

- [ ] **Step 8: IndexNow + memory** — `printf '%s\n' <23 new/changed URLs> <doc URLs cited by the 20 stories> | xargs python3 crawler/indexnow.py` (xargs: zsh does not word-split `$var`); append the release line (deploy version, commits, old-repo sha) to project memory `realufo-project-state.md`, noting "C done except the 11 foreign overviews, glossary and timeline".
