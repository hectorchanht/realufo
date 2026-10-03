# Case Stories (fold 12 into realufo.org) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The 12 `/case/<slug>` pages carry full, fact-checked stories (sections, quotes, timeline, page-cited sources), and the 12 old release.realufo.org story URLs 301 to them.

**Architecture:** Types + citation helpers in an import-free `worker/lib/caseStories.ts`; the researched text in `worker/lib/caseStoryText.ts` (Worker-only, never bundled into the SPA). The case API and crawler loader resolve sources to doc titles/links (a "story view"); doc pages get "Cited in", topic hubs list citing stories. The old Astro repo stops building the 12 pages and emits absolute 301s before its 200 rewrites.

**Tech Stack:** Cloudflare Worker (TypeScript, D1), vitest + `@cloudflare/vitest-pool-workers`, React 18 + react-router + TanStack Query; old repo: Astro + Python generator scripts on Cloudflare Pages (deployed by GitHub Action on push to `main`).

**Spec:** `docs/superpowers/specs/2026-10-03-realufo-case-stories-design.md`

## Global Constraints

- Batch = exactly these 12 case slugs: `roswell, kaikoura, jal-1628, tehran, socorro, travis-walton, shag-harbour, ohare-2006, stephenville, trans-en-provence, manises, falcon-lake`.
- Nothing is copied from the old stories as-is: every claim and quote is verified against a primary document; quotes match source wording exactly and cite the PDF page; unverifiable claims are dropped and listed; lore contradicted by files gets one explicit sentence.
- Each source has exactly one of `id` (realufo record → `/doc/<id>?p=<page>`) or `url` (outside); every `[n]`/`src` points at an existing source; every source is cited; stories 600–1,600 words.
- `cases.lede` stays as the opening paragraph; the story follows it. A case with no story renders as today.
- Two user gates: format gate (socorro + kaikoura) and full gate (other 10), both before deploy. The old-repo diff needs the user's OK before merge to `main` + push.
- The SPA must never import `worker/lib/caseStoryText.ts` (bundle size); it imports only types/helpers from `worker/lib/caseStories.ts`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; stage only files you touched (other sessions share this checkout; partial-stage via `git hash-object -w` + `git update-index --cacheinfo` if a file also holds someone else's uncommitted edits).
- Worker tests: `npx vitest run -c worker/vitest.config.ts <files>` (repo root). Web tests: `cd web && npx vitest run <files>`; the web suite has pre-existing unrelated failures (client, components, doc, theme) — compare against that baseline.

## Review Focus

- A paragraph containing a literal bracket that isn't a citation (e.g. "[sic]", "[redacted]") must render as text, not a broken link — pinned in Task 1.
- A cited realufo record that is missing or not live must render as plain text, not a dead `/doc/` link — pinned in Task 4.
- HTML special characters in story text (quotes, `&`, `<`) must be escaped in the crawler HTML — pinned in Task 5.
- `/stories/<slug>` on the apex for a moved slug must 301 once to `/case/<slug>`; unmoved slugs keep going to release.realufo.org — pinned in Task 4.
- A case without a story must keep the current page exactly (no empty "Evidence" section, no broken JSON-LD) — pinned in Task 5.

---

## File Structure

- Create `worker/lib/caseStories.ts` — import-free: `StorySource`, `StorySection`, `CaseStory`, `StoryView`, `CASE_SLUGS`, `citeParts`, `citedSources`, `storyWords`, `storyProblems`.
- Create `worker/lib/caseStoryText.ts` — `CASE_STORY_TEXT: Record<string, CaseStory>` (researched content).
- Create `scripts/check_case_sources.py` — verifies ids/pages in prod D1 and outside URLs.
- Modify `worker/routes/cases.ts` (`storyView`, story on `/api/cases/:slug`), `worker/lib/pages.ts` (`casePage`), `worker/lib/ssr.ts` (`caseBody` story render, `docBody` "Cited in"), `worker/routes/records.ts` (`citedIn`), `worker/routes/hubs.ts` (topic stories incl. case stories; `href`), `worker/lib/topics.ts` (`TopicBlock.stories[].href`), `worker/routes/sitemap.ts` (case `lastmod`), `worker/index.ts` (legacy redirect for moved slugs).
- Web: `web/src/api/types.ts`, `web/src/screens/Case.tsx`, `web/src/screens/Doc.tsx`, `web/src/screens/Hub.tsx` (story `href`).
- Old repo `/Users/laichan/code/tung/war-gov-ufo-release`: `src/data/stories.json`, `src/pages/stories/[slug].astro`, `src/pages/stories/index.astro`, `src/components/Footer.astro`, `URL-CONTRACT.txt`, `scripts/build-redirects.py`, generated `_redirects`, sitemap output.
- Tests: create `worker/tests/caseStories.spec.ts`, `worker/tests/cases-story.spec.ts`; modify `worker/tests/meta.spec.ts`, `worker/tests/topics-api.spec.ts`, `web/src/tests/case.test.tsx`, `web/src/tests/hub.test.tsx`.

---

### Task 1: Story model + citation helpers

**Files:**
- Create: `worker/lib/caseStories.ts`
- Test: `worker/tests/caseStories.spec.ts`

**Interfaces:**
- Produces (from `worker/lib/caseStories.ts`):
  - `interface StorySource { id?: string; url?: string; page?: number; note: string }`
  - `interface StorySection { heading: string; paras: string[]; quote?: { text: string; who: string; src: number } }`
  - `interface CaseStory { title: string; sections: StorySection[]; timeline: { date: string; event: string; src?: number }[]; sources: StorySource[]; updated: string }`
  - `interface StoryView extends Omit<CaseStory, "sources"> { sources: { n: number; href: string | null; label: string; note: string; external: boolean }[] }`
  - `const CASE_SLUGS: string[]` (the 12)
  - `citeParts(text: string, max: number): (string | { n: number })[]` — splits `[n]` markers with `1 ≤ n ≤ max`; any other bracket stays text
  - `citedSources(s: CaseStory): Set<number>`
  - `storyWords(s: CaseStory): number`
  - `storyProblems(slug: string, s: CaseStory): string[]` — empty when valid

- [ ] **Step 1: Write the failing tests** — `worker/tests/caseStories.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { CASE_SLUGS, citeParts, citedSources, storyProblems, storyWords, type CaseStory } from "../lib/caseStories";

const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");
const ok: CaseStory = {
  title: "Socorro 1964: Test",
  sections: [{ heading: "H", paras: [`${words(650)} [1] and [2].`], quote: { text: "Q", who: "Zamora", src: 1 } }],
  timeline: [{ date: "1964-04-24", event: "Landing report", src: 2 }],
  sources: [{ id: "DOW-UAP-D001", page: 3, note: "n1" }, { url: "https://release.realufo.org/nara/socorro.html", note: "n2" }],
  updated: "2026-10-03",
};

describe("citeParts", () => {
  it("splits valid [n] markers and leaves other brackets as text", () => {
    expect(citeParts("A [1] b [2][3] c [sic] d [9] e [redacted].", 3)).toEqual([
      "A ", { n: 1 }, " b ", { n: 2 }, { n: 3 }, " c [sic] d [9] e [redacted].",
    ]);
    expect(citeParts("no cites", 2)).toEqual(["no cites"]);
  });
});

describe("story validation", () => {
  it("a valid story has no problems", () => {
    expect(storyProblems("socorro", ok)).toEqual([]);
    expect([...citedSources(ok)].sort()).toEqual([1, 2]);
    expect(storyWords(ok)).toBeGreaterThan(600);
  });
  it("flags bad markers, uncited sources, bad source shape, length, date, slug", () => {
    const bad: CaseStory = {
      ...ok,
      sections: [{ heading: "H", paras: ["short [1] [4]"] }],
      sources: [{ id: "A", note: "x" }, { id: "B", url: "https://x", note: "y" }, { note: "z" }],
      updated: "Oct 2026",
    };
    const p = storyProblems("not-a-case", bad).join(" | ");
    expect(p).toMatch(/not a batch case slug/);
    expect(p).toMatch(/\[4\] has no source/);
    expect(p).toMatch(/source 2 is never cited/);
    expect(p).toMatch(/source 2 needs exactly one of id\/url/);
    expect(p).toMatch(/source 3 needs exactly one of id\/url/);
    expect(p).toMatch(/words/);
    expect(p).toMatch(/updated/);
  });
  it("CASE_SLUGS is the batch", () => {
    expect(CASE_SLUGS).toEqual(["roswell", "kaikoura", "jal-1628", "tehran", "socorro", "travis-walton", "shag-harbour", "ohare-2006", "stephenville", "trans-en-provence", "manises", "falcon-lake"]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run -c worker/vitest.config.ts worker/tests/caseStories.spec.ts` → FAIL (cannot resolve `../lib/caseStories`).

- [ ] **Step 3: Implement `worker/lib/caseStories.ts`**

```ts
// Case stories (spec 2026-10-03-realufo-case-stories-design): types and the
// citation helpers shared by the Worker and the SPA. Import-free on purpose;
// the researched text lives in caseStoryText.ts (Worker-only, never bundled).

export interface StorySource { id?: string; url?: string; page?: number; note: string }
export interface StorySection { heading: string; paras: string[]; quote?: { text: string; who: string; src: number } }
export interface CaseStory {
  title: string;
  sections: StorySection[];
  timeline: { date: string; event: string; src?: number }[];
  sources: StorySource[]; // 1-based; text cites [n]
  updated: string; // ISO date of the fact-check
}
// What the page renders: sources resolved to links (null href = record gone).
export interface StoryView extends Omit<CaseStory, "sources"> {
  sources: { n: number; href: string | null; label: string; note: string; external: boolean }[];
}

export const CASE_SLUGS = [
  "roswell", "kaikoura", "jal-1628", "tehran", "socorro", "travis-walton",
  "shag-harbour", "ohare-2006", "stephenville", "trans-en-provence", "manises", "falcon-lake",
];

// "[n]" with 1 ≤ n ≤ max becomes a citation; any other bracket ("[sic]", "[9]") stays text.
export function citeParts(text: string, max: number): (string | { n: number })[] {
  const out: (string | { n: number })[] = [];
  let buf = "";
  for (const part of text.split(/(\[\d+\])/)) {
    const m = /^\[(\d+)\]$/.exec(part);
    const n = m ? Number(m[1]) : 0;
    if (m && n >= 1 && n <= max) {
      if (buf) out.push(buf);
      buf = "";
      out.push({ n });
    } else buf += part;
  }
  if (buf) out.push(buf);
  return out;
}

const markers = (t: string) => [...t.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));

export function citedSources(s: CaseStory): Set<number> {
  const set = new Set<number>();
  for (const sec of s.sections) {
    for (const p of sec.paras) markers(p).forEach((n) => set.add(n));
    if (sec.quote) set.add(sec.quote.src);
  }
  for (const t of s.timeline) if (t.src) set.add(t.src);
  return set;
}

export const storyWords = (s: CaseStory) =>
  s.sections.flatMap((x) => [...x.paras, x.quote?.text ?? ""]).join(" ").split(/\s+/).filter(Boolean).length;

export function storyProblems(slug: string, s: CaseStory): string[] {
  const p: string[] = [];
  const max = s.sources.length;
  if (!CASE_SLUGS.includes(slug)) p.push(`${slug} is not a batch case slug`);
  for (const n of citedSources(s)) if (n < 1 || n > max) p.push(`[${n}] has no source`);
  const cited = citedSources(s);
  s.sources.forEach((src, i) => {
    const n = i + 1;
    if (!cited.has(n)) p.push(`source ${n} is never cited`);
    if (!!src.id === !!src.url) p.push(`source ${n} needs exactly one of id/url`);
    if (src.page !== undefined && !(Number.isInteger(src.page) && src.page > 0)) p.push(`source ${n} page must be a positive integer`);
  });
  const w = storyWords(s);
  if (w < 600 || w > 1600) p.push(`${w} words (want 600–1600)`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.updated)) p.push(`updated "${s.updated}" is not an ISO date`);
  return p;
}
```

- [ ] **Step 4: Run tests** → PASS. `npx tsc --noEmit -p .` → no output.

- [ ] **Step 5: Commit**

```bash
git add worker/lib/caseStories.ts worker/tests/caseStories.spec.ts
git commit -m "feat(cases): case story model and citation helpers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Fact-check + write Socorro and Kaikoura (format gate)

**Files:**
- Create: `worker/lib/caseStoryText.ts`, `scripts/check_case_sources.py`
- Test: `worker/tests/caseStories.spec.ts` (append)

**Interfaces:**
- Consumes: `CaseStory`, `storyProblems`, `CASE_SLUGS` (Task 1).
- Produces: `CASE_STORY_TEXT: Record<string, CaseStory>` with keys `socorro`, `kaikoura` (the other 10 in Task 3).

- [ ] **Step 1: Write the failing test** — append to `worker/tests/caseStories.spec.ts` (move the import to the top):

```ts
import { CASE_STORY_TEXT } from "../lib/caseStoryText";

describe("CASE_STORY_TEXT", () => {
  it("every story is valid", () => {
    expect(Object.keys(CASE_STORY_TEXT).length).toBeGreaterThan(0);
    for (const [slug, s] of Object.entries(CASE_STORY_TEXT)) expect(storyProblems(slug, s), slug).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — FAIL (cannot resolve `../lib/caseStoryText`).

- [ ] **Step 3: Research socorro and kaikoura** — dispatch two parallel read-only research agents (one per story) with this brief (fill in the slug):

  > Read the old story: `/Users/laichan/code/tung/war-gov-ufo-release/legacy/<archive>/<slug>.html` (path from that repo's `src/data/stories.json`, field `legacyPath`) and the case lede in prod D1 (`SELECT * FROM cases WHERE slug='<slug>'`). List every factual claim and quote. Verify each against primary documents: realufo.org records (`npx wrangler d1 execute realufo-db --remote --json --command "<SELECT>"`; tables `records`, `record_text` (pages JSON, match the `n` field), `record_fts`), the subdomain's own archive files (e.g. `https://release.realufo.org/nara/...`), and national-archive catalogue pages. Quotes must match the source wording exactly, with the PDF page. Rewrite as a `CaseStory` (types in `worker/lib/caseStories.ts`): title "<Case> <year>: <what the files show>", 3–6 sections (h2 + paragraphs citing `[n]`), optional one quote per section with `src`, a dated timeline, 4–10 sources (exactly one of `id` for a realufo record, or `url` for outside; `page` = PDF page), `updated: "<today>"`, 700–1,400 words, neutral and factual, one explicit sentence where popular lore is contradicted by the files. Drop anything you can't verify. READ-ONLY: return the TypeScript entry plus an evidence list (per source: page + verbatim quote ≤ 20 words) and a list of dropped claims.

- [ ] **Step 4: Write `worker/lib/caseStoryText.ts`** with the two returned entries (spot-check at least 3 quotes per story yourself against the cited page text before pasting):

```ts
// Fact-checked case stories (spec 2026-10-03-realufo-case-stories-design).
// Worker-only — never import into the SPA. Every claim cites `sources`.
import type { CaseStory } from "./caseStories";

export const CASE_STORY_TEXT: Record<string, CaseStory> = {
  socorro: { /* entry returned by the research agent, after spot-checks */ },
  kaikoura: { /* … */ },
};
```

- [ ] **Step 5: Write and run `scripts/check_case_sources.py`**

```python
#!/usr/bin/env python3
"""Verify case story sources (worker/lib/caseStoryText.ts): every id exists and is
live in prod D1 with page <= its page count; every url answers HTTP < 400."""
import json, re, subprocess, sys, urllib.request

src = open("worker/lib/caseStoryText.ts").read()
ids = re.findall(r'\{\s*id:\s*"([^"]+)"(?:,\s*page:\s*(\d+))?', src)
urls = sorted(set(re.findall(r'url:\s*"([^"]+)"', src)))
bad = []
if ids:
    q = ",".join("'" + i.replace("'", "''") + "'" for i in sorted({i for i, _ in ids}))
    out = subprocess.run(["npx", "wrangler", "d1", "execute", "realufo-db", "--remote", "--json", "--command",
                          f"SELECT r.id, r.status, t.total_pages FROM records r LEFT JOIN record_text t ON t.record_id=r.id WHERE r.id IN ({q})"],
                         capture_output=True, text=True).stdout
    rows = {r["id"]: r for r in json.loads(out[out.index("["):out.rindex("]") + 1])[0]["results"]}
    for i, p in ids:
        r = rows.get(i)
        if not r or r["status"] != "live": bad.append(f"{i}: missing or not live")
        elif p and r["total_pages"] and int(p) > int(r["total_pages"]): bad.append(f"{i}: page {p} > {r['total_pages']}")
for u in urls:
    for method in ("HEAD", "GET"):
        try:
            with urllib.request.urlopen(urllib.request.Request(u, method=method, headers={"User-Agent": "realufo-check/1.0"}), timeout=20) as r:
                if r.status < 400: break
        except Exception as e:
            err = str(e)
    else:
        bad.append(f"{u}: {err}")
print("\n".join(bad) or f"ok: {len(ids)} archive sources, {len(urls)} urls")
sys.exit(1 if bad else 0)
```

Run: `python3 scripts/check_case_sources.py` → `ok: …`.

- [ ] **Step 6: Run tests** → PASS; `npx tsc --noEmit -p .` clean.

- [ ] **Step 7: Commit**

```bash
git add worker/lib/caseStoryText.ts scripts/check_case_sources.py worker/tests/caseStories.spec.ts
git commit -m "feat(cases): fact-checked Socorro and Kaikoura stories + source check

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 8: STOP — format gate.** Show the user both stories (title, sections, quotes, timeline, sources) and the dropped-claims lists; wait for approval or edits. Apply edits (re-run the check + tests, commit) before Task 3.

---

### Task 3: Fact-check + write the other 10 (full gate)

**Files:**
- Modify: `worker/lib/caseStoryText.ts`

**Interfaces:**
- Consumes/produces: `CASE_STORY_TEXT` gains roswell, jal-1628, tehran, travis-walton, shag-harbour, ohare-2006, stephenville, trans-en-provence, manises, falcon-lake.

- [ ] **Step 1: Extend the test** — in `worker/tests/caseStories.spec.ts` add to the `CASE_STORY_TEXT` describe:

```ts
  it("covers all 12 batch cases", () => {
    expect(Object.keys(CASE_STORY_TEXT).sort()).toEqual([...CASE_SLUGS].sort());
  });
```

- [ ] **Step 2: Run** → FAIL (only 2 keys).

- [ ] **Step 3: Research the 10** — same agent brief as Task 2 Step 3, in parallel batches (e.g. 3–4 agents, 2–3 stories each), applying any format changes the user asked for at the format gate.

- [ ] **Step 4: Add the 10 entries** to `CASE_STORY_TEXT` (spot-check ≥ 2 quotes each).

- [ ] **Step 5: Run** `python3 scripts/check_case_sources.py` → ok; tests → PASS.

- [ ] **Step 6: Commit**

```bash
git add worker/lib/caseStoryText.ts worker/tests/caseStories.spec.ts
git commit -m "feat(cases): fact-checked stories for the remaining 10 cases

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7: STOP — full gate.** Show the user the 10 stories + dropped claims; wait for approval; apply edits.

---

### Task 4: Worker — story view, case API, Cited in, topic stories, sitemap, redirect

**Files:**
- Modify: `worker/routes/cases.ts`, `worker/routes/records.ts`, `worker/routes/hubs.ts`, `worker/lib/topics.ts`, `worker/routes/sitemap.ts`, `worker/index.ts`
- Test: create `worker/tests/cases-story.spec.ts`; modify `worker/tests/topics-api.spec.ts`

**Interfaces:**
- Consumes: `CASE_STORY_TEXT` (Tasks 2–3), `StoryView`, `CaseStory` (Task 1), `docTitle`, `docHref` (`worker/lib/ssr.ts`).
- Produces:
  - `storyView(env: Env, slug: string): Promise<StoryView | null>` exported from `worker/routes/cases.ts`
  - `GET /api/cases/:slug` adds `story: StoryView | null`
  - record detail adds `citedIn: { slug: string; title: string }[]`
  - `TopicBlock.stories[]` gains `href: string` (articles `/thread/<id>`, cases `/case/<slug>`)

- [ ] **Step 1: Write the failing tests**

Create `worker/tests/cases-story.spec.ts`:

```ts
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../index";
import { seedTestDB } from "./helpers";
import { storyView } from "../routes/cases";
import { CASE_STORY_TEXT } from "../lib/caseStoryText";

const S = CASE_STORY_TEXT.socorro;
const firstId = S.sources.find((s) => s.id)!.id!;
beforeAll(async () => {
  await seedTestDB(env.DB);
  await env.DB.prepare("INSERT INTO records(id,archive,agency,title,summary,kind,status) VALUES (?,?,?,?,?,?,?)")
    .bind(firstId, "nara", "NARA", `${firstId}, Socorro source`, "x", "pdf", "live").run();
});
const call = async (path: string) => {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request("https://cases.test" + path), env as any, ctx);
  await waitOnExecutionContext(ctx);
  return res;
};

describe("case story view", () => {
  it("resolves archive sources to doc links, outside to urls, missing records to plain text", async () => {
    const v = (await storyView(env as any, "socorro"))!;
    expect(v.title).toBe(S.title);
    const first = v.sources[S.sources.findIndex((s) => s.id === firstId)];
    const page = S.sources.find((s) => s.id === firstId)!.page;
    expect(first.href).toBe(`/doc/${encodeURIComponent(firstId)}${page ? `?p=${page}` : ""}`);
    expect(first.label).toContain("Socorro source");
    const ext = v.sources.find((s) => s.external);
    if (ext) expect(ext.href).toMatch(/^https:\/\//);
    const gone = v.sources.find((s, i) => S.sources[i].id && S.sources[i].id !== firstId);
    if (gone) { expect(gone.href).toBeNull(); expect(gone.label).toMatch(/no longer available/); }
    expect(await storyView(env as any, "nope")).toBeNull();
  });

  it("GET /api/cases/socorro includes the story", async () => {
    const d: any = await (await call("/api/cases/socorro")).json();
    expect(d.story.title).toBe(S.title);
    expect(d.story.sources.length).toBe(S.sources.length);
  });

  it("doc pages list the stories that cite them", async () => {
    const d: any = await (await call(`/api/records/${encodeURIComponent(firstId)}`)).json();
    expect(d.citedIn).toEqual([{ slug: "socorro", title: S.title }]);
  });

  it("apex /stories/<moved slug> goes straight to /case; others to the subdomain", async () => {
    const moved = await call("/stories/socorro/");
    expect(moved.status).toBe(301);
    expect(moved.headers.get("location")).toBe("https://cases.test/case/socorro");
    const other = await call("/stories/tic-tac/");
    expect(other.headers.get("location")).toBe("https://release.realufo.org/stories/tic-tac/");
  });

  it("sitemap case entries carry lastmod from the story", async () => {
    const xml = await (await call("/sitemap.xml")).text();
    expect(xml).toContain(`<loc>https://cases.test/case/socorro</loc><lastmod>${S.updated}</lastmod>`);
  });
});
```

(The seeded `cases` table holds all 12 slugs from `realufo-handoff/data.js` + migration 0016 — confirm `socorro` exists in the seed; if not, insert it in `beforeAll`.)

In `worker/tests/topics-api.spec.ts`, change the stories expectation to include `href`:

```ts
    expect(h.topic.stories).toEqual([{ slug: "tstory", title: "Test story", threadId: "ar_tstory", href: "/thread/ar_tstory" }]);
```

- [ ] **Step 2: Run** `npx vitest run -c worker/vitest.config.ts worker/tests/cases-story.spec.ts worker/tests/topics-api.spec.ts` → FAIL.

- [ ] **Step 3: Implement**

`worker/routes/cases.ts`:

```ts
import { CASE_STORY_TEXT } from "../lib/caseStoryText";
import type { StoryView } from "../lib/caseStories";
import { docHref, docTitle } from "../lib/ssr";

// Sources resolved for rendering: realufo records → doc link + title (plain text if gone),
// outside → url + host label.
export async function storyView(env: Env, slug: string): Promise<StoryView | null> {
  const s = CASE_STORY_TEXT[slug];
  if (!s) return null;
  const ids = s.sources.flatMap((x) => (x.id ? [x.id] : []));
  const { results } = await env.DB.prepare("SELECT id,title,kind FROM records WHERE status='live' AND id IN (SELECT value FROM json_each(?))")
    .bind(JSON.stringify(ids))
    .all<{ id: string; title: string; kind: string }>();
  const byId = new Map(results.map((r) => [r.id, r]));
  return {
    ...s,
    sources: s.sources.map((x, i) => {
      if (x.url) return { n: i + 1, href: x.url, label: new URL(x.url).host, note: x.note, external: true };
      const r = byId.get(x.id!);
      const page = x.page ? ` — p. ${x.page}` : "";
      return r
        ? { n: i + 1, href: `${docHref(r.id)}${x.page ? `?p=${x.page}` : ""}`, label: `${docTitle(r.title, r.id, r.kind)}${page}`, note: x.note, external: false }
        : { n: i + 1, href: null, label: `realufo file ${x.id} (no longer available)`, note: x.note, external: false };
    }),
  };
}
```

and in `getCase`, return `json({ case: c, threads, relatedThread: threads[0] ?? null, story: await storyView(env, p.slug) })`.

`worker/routes/records.ts` — import `CASE_STORY_TEXT` and add to the returned detail:

```ts
    citedIn: Object.entries(CASE_STORY_TEXT)
      .filter(([, s]) => s.sources.some((x) => x.id === id))
      .map(([slug, s]) => ({ slug, title: s.title })),
```

`worker/lib/topics.ts` — `TopicBlock.stories` element type becomes `{ slug: string; title: string; threadId: string | null; href: string }`.

`worker/routes/hubs.ts` `topicBlock` — articles map to `href: \`/thread/${s.threadId}\`` (skip rows whose `threadId` is null), then append citing case stories:

```ts
import { CASE_STORY_TEXT } from "../lib/caseStoryText";
…
  const memberSet = new Set(members);
  const caseStories = Object.entries(CASE_STORY_TEXT)
    .filter(([, s]) => s.sources.some((x) => x.id && memberSet.has(x.id)))
    .map(([slug, s]) => ({ slug, title: s.title, threadId: null, href: `/case/${slug}` }));
  …
    stories: [
      ...stories.results.filter((s) => s.threadId).map((s) => ({ slug: s.slug, title: s.title, threadId: s.threadId, href: `/thread/${s.threadId}` })),
      ...caseStories,
    ],
```

`worker/routes/sitemap.ts` — import `CASE_STORY_TEXT`; case line becomes `loc(\`/case/${e(c.id)}\`, CASE_STORY_TEXT[c.id]?.updated)` (check `loc`'s signature at the top of the file: `(path, d?, extra?)`).

`worker/index.ts` — before the `LEGACY_PATH` branch:

```ts
    // Stories folded into case pages (spec 2026-10-03-realufo-case-stories-design):
    // straight to /case, no apex → subdomain → apex chain.
    const moved = /^\/stories\/([a-z0-9-]+)\/?$/.exec(url.pathname)?.[1];
    if (moved && CASE_STORY_TEXT[moved]) return Response.redirect(`${url.origin}/case/${moved}`, 301);
```

with `import { CASE_STORY_TEXT } from "./lib/caseStoryText";`.

Update SSR `storiesHtml` and the SPA `Stories` later tasks to use `href`; for now make `storiesHtml` (ssr.ts) use `s.href` so the worker suite stays green:

```ts
const storiesHtml = (t: TopicBlock) => section("Related stories", t.stories.map((s) => ({ href: s.href, text: s.title })));
```

- [ ] **Step 4: Run** the full worker suite `npx vitest run -c worker/vitest.config.ts` → all pass; `npx tsc --noEmit -p .` clean.

- [ ] **Step 5: Commit**

```bash
git add worker/routes/cases.ts worker/routes/records.ts worker/routes/hubs.ts worker/lib/topics.ts worker/routes/sitemap.ts worker/index.ts worker/lib/ssr.ts worker/tests/cases-story.spec.ts worker/tests/topics-api.spec.ts
git commit -m "feat(cases): story view in the case API, Cited in on docs, case stories on topics, sitemap lastmod, apex /stories redirect

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Crawler HTML — story on the case page, Cited in on docs

**Files:**
- Modify: `worker/lib/ssr.ts` (`caseBody`, `docBody`, `DocData`), `worker/lib/pages.ts` (`casePage`)
- Test: `worker/tests/meta.spec.ts`

**Interfaces:**
- Consumes: `storyView` (Task 4), `StoryView`, `citeParts` (Task 1), detail `citedIn` (Task 4).

- [ ] **Step 1: Write the failing tests** — append to `worker/tests/meta.spec.ts`:

```ts
describe("case story pages (crawler HTML)", () => {
  const fakeAssets = {
    fetch: async () => new Response('<html><head><!--META--></head><body><div id="root"></div></body></html>', { headers: { "content-type": "text/html" } }),
  };
  const get = async (path: string) => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("https://casepages.test" + path, { headers: { accept: "text/html" } }), { ...env, ASSETS: fakeAssets } as any, ctx);
    await waitOnExecutionContext(ctx);
    return res.text();
  };

  it("socorro: story title h1, sections, citations, timeline, numbered sources, Article JSON-LD", async () => {
    const { CASE_STORY_TEXT } = await import("../lib/caseStoryText");
    const S = CASE_STORY_TEXT.socorro;
    const html = await get("/case/socorro");
    const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    expect(html).toContain(`<h1>${esc(S.title)}</h1>`);
    expect(html).toContain(`<h2>${esc(S.sections[0].heading)}</h2>`);
    expect(html).toMatch(/<sup><a href="#src-\d+">\[\d+\]<\/a><\/sup>/);
    expect(html).toContain("<h2>Timeline</h2>");
    expect(html).toContain("<h2>Evidence &amp; sources</h2>");
    expect(html).toContain('<li id="src-1">');
    expect(html).toContain('"@type":"Article"');
    expect(html).toContain(`"dateModified":"${S.updated}"`);
    expect(html).toContain('"citation":[');
    expect(html).not.toContain("release.realufo.org/stories/socorro");
    expect(html).toContain("Last fact-checked:");
  });

  it("a case without a story renders as before", async () => {
    await env.DB.prepare("INSERT INTO cases(slug,name,lede) VALUES ('test-case','Test Case','A lede.')").run();
    const html = await get("/case/test-case");
    expect(html).toContain("<h1>Test Case</h1>");
    expect(html).not.toContain("Evidence &amp; sources");
    expect(html).not.toContain('"dateModified"');
  });
});
```

Also add to the same describe, for "Cited in" (uses the record inserted by the source; insert it here):

```ts
  it("doc pages show Cited in", async () => {
    const { CASE_STORY_TEXT } = await import("../lib/caseStoryText");
    const S = CASE_STORY_TEXT.socorro;
    const id = S.sources.find((s) => s.id)!.id!;
    await env.DB.prepare("INSERT OR IGNORE INTO records(id,archive,agency,title,summary,kind,status) VALUES (?,?,?,?,?,?,?)")
      .bind(id, "nara", "NARA", `${id}, Socorro source`, "x", "pdf", "live").run();
    const html = await get(`/doc/${encodeURIComponent(id)}`);
    expect(html).toContain('Cited in: <a href="/case/socorro">');
  });
```

- [ ] **Step 2: Run** `npx vitest run -c worker/vitest.config.ts worker/tests/meta.spec.ts` → FAIL.

- [ ] **Step 3: Implement**

`worker/lib/ssr.ts`:

Add `import { citeParts, type StoryView } from "./caseStories";`.

Add the renderer:

```ts
const citeHtml = (text: string, max: number) =>
  citeParts(text, max).map((p) => (typeof p === "string" ? esc(p) : `<sup><a href="#src-${p.n}">[${p.n}]</a></sup>`)).join("");

function storyHtml(v: StoryView): string {
  const max = v.sources.length;
  const secs = v.sections
    .map((s) =>
      [
        `<h2>${esc(s.heading)}</h2>`,
        ...s.paras.map((p) => `<p>${citeHtml(p, max)}</p>`),
        s.quote ? `<blockquote><p>${esc(s.quote.text)}</p><cite>— ${esc(s.quote.who)} <a href="#src-${s.quote.src}">[${s.quote.src}]</a></cite></blockquote>` : "",
      ].join("")
    )
    .join("");
  const timeline = v.timeline.length
    ? `<section><h2>Timeline</h2><ul>${v.timeline.map((t) => `<li><b>${esc(t.date)}</b> ${esc(t.event)}${t.src ? ` <a href="#src-${t.src}">[${t.src}]</a>` : ""}</li>`).join("")}</ul></section>`
    : "";
  const sources = `<section><h2>Evidence &amp; sources</h2><ol>${v.sources
    .map((s) => {
      const link = s.href
        ? `<a href="${esc(s.href)}"${s.external ? ' target="_blank" rel="noopener"' : ""}>${esc(s.label)}</a>`
        : esc(s.label);
      return `<li id="src-${s.n}">${link}: ${esc(s.note)}</li>`;
    })
    .join("")}</ol></section>`;
  return `${secs}${timeline}${sources}<p><small>Last fact-checked: ${esc(v.updated)}. Every claim cites its source.</small></p>`;
}
```

Change `caseBody`'s input to accept `story?: StoryView | null`, use `story?.title ?? name` for the h1, render `storyHtml(story)` after the lede/facts/quote when present, and drop the `caseStoryUrl` "Full story" link when a story is present (keep it when absent). `tabBody(title, lede, …)` already writes the h1 + lede, so pass `c.story?.title ?? c.name` as the title.

`DocData` gains `citedIn?: { slug: string; title: string }[];`. In `docBody`, after the Topics row:

```ts
    d.citedIn?.length ? `<p>Cited in: ${d.citedIn.map((c) => a({ href: `/case/${encodeURIComponent(c.slug)}`, text: c.title })).join(" · ")}</p>` : "",
```

`worker/lib/pages.ts` `casePage` — load the view and pass it:

```ts
import { storyView } from "../routes/cases";
…
  const [x, thread, others, story] = await Promise.all([
    …existing three…,
    storyView(env, g.slug),
  ]);
  if (!x) return null;
  const description = (x.lede || "").slice(0, 200);
  const title = story?.title ?? x.name;
  return {
    meta: {
      title, description,
      jsonLd: {
        "@type": "Article", headline: title, description, about: x.name,
        ...(story ? { dateModified: story.updated, citation: story.sources.flatMap((s) => (s.href ? [s.external ? s.href : `${url.origin}${s.href}`] : [])) } : {}),
      },
    },
    body: caseBody({ ...x, thread, others: others.results, story }),
  };
```

(`casePage` gains the `url` parameter: `async (env, g, url) =>`.)

- [ ] **Step 4: Run** the full worker suite → all pass; `npx tsc --noEmit -p .` clean.

- [ ] **Step 5: Commit**

```bash
git add worker/lib/ssr.ts worker/lib/pages.ts worker/tests/meta.spec.ts
git commit -m "feat(cases): case story pages and Cited in for crawlers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: SPA — Case story, Doc Cited in, topic story links

**Files:**
- Modify: `web/src/api/types.ts`, `web/src/screens/Case.tsx`, `web/src/screens/Doc.tsx`, `web/src/screens/Hub.tsx`
- Test: `web/src/tests/case.test.tsx`, `web/src/tests/hub.test.tsx`

**Interfaces:**
- Consumes: `/api/cases/:slug` → `story: StoryView | null`; record detail `citedIn`; `TopicBlock.stories[].href` (Task 4); `citeParts`, `StoryView` type-only/pure from `../../../worker/lib/caseStories`.

- [ ] **Step 1: Write the failing tests**

In `web/src/tests/case.test.tsx`, add (reusing `useCaseMock`, `renderCase`, `roswellCase`):

```tsx
  it("renders the story: title, sections with citations, quote, timeline, numbered sources", () => {
    useCaseMock.mockReturnValue({
      data: {
        ...roswellCase,
        story: {
          title: "Roswell 1947: What the Files Show",
          sections: [{ heading: "The debris", paras: ["Brazel found debris [1]. A note [sic] stays text."], quote: { text: "a disc", who: "RAAF press release", src: 2 } }],
          timeline: [{ date: "1947-07-08", event: "Press release", src: 2 }],
          sources: [
            { n: 1, href: "/doc/A-1?p=3", label: "A-1 — p. 3", note: "debris report", external: false },
            { n: 2, href: "https://catalog.archives.gov/x", label: "catalog.archives.gov", note: "press release", external: true },
          ],
          updated: "2026-10-03",
        },
      },
      isLoading: false,
    });
    renderCase();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Roswell 1947: What the Files Show");
    expect(screen.getByRole("heading", { name: "The debris" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "[1]" }).getAttribute("href")).toBe("#src-1");
    expect(screen.getByText(/A note \[sic\] stays text\./)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "A-1 — p. 3" }).getAttribute("href")).toBe("/doc/A-1?p=3");
    expect(screen.getByRole("link", { name: "catalog.archives.gov" }).getAttribute("target")).toBe("_blank");
    expect(screen.queryByRole("link", { name: /Full story, timeline and sources/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Last fact-checked: 2026-10-03/)).toBeInTheDocument();
  });
```

In `web/src/tests/hub.test.tsx`, update the `aawsap` fixture's story to include `href: "/thread/ar_warp-drives"` and add a case story `{ slug: "socorro", title: "Socorro 1964", threadId: null, href: "/case/socorro" }`; assert `screen.getByRole("link", { name: "Socorro 1964" }).getAttribute("href")` is `/case/socorro`.

- [ ] **Step 2: Run** `cd web && npx vitest run src/tests/case.test.tsx src/tests/hub.test.tsx` → new assertions FAIL.

- [ ] **Step 3: Implement**

`web/src/api/types.ts`: `CaseDetail` gains `story?: import("../../../worker/lib/caseStories").StoryView | null;`; `RecordDetail` gains `citedIn?: { slug: string; title: string }[];`.

`web/src/screens/Case.tsx`:
- h1 text: `{data?.story?.title ?? caseDetail.name}`.
- Replace the "Full story, timeline and sources ↗" `<a>` with `{!story && (…existing link…)}`.
- After the pull-quote blockquote and before the discussion cards, render `{story && <Story v={story} />}`:

```tsx
import { citeParts, type StoryView } from "../../../worker/lib/caseStories";

function Cited({ text, max }: { text: string; max: number }) {
  return (
    <>
      {citeParts(text, max).map((p, i) =>
        typeof p === "string" ? <span key={i}>{p}</span> : <sup key={i}><a href={`#src-${p.n}`} className="text-signal">[{p.n}]</a></sup>
      )}
    </>
  );
}

function Story({ v }: { v: StoryView }) {
  const max = v.sources.length;
  return (
    <article className="mb-[22px]">
      {v.sections.map((s) => (
        <section key={s.heading} className="mb-4">
          <h2 className="mb-2 text-[17px] font-bold text-ink">{s.heading}</h2>
          {s.paras.map((p, i) => <p key={i} className="mb-3 text-[15px] leading-[1.65] text-dim"><Cited text={p} max={max} /></p>)}
          {s.quote && (
            <blockquote className="mb-3 rounded-r-xl border-l-[3px] border-signal bg-surface px-[18px] py-3">
              <div className="text-[15px] italic leading-[1.55] text-ink">“{s.quote.text}”</div>
              <div className="mt-2 font-mono text-[10px] text-faint">— {s.quote.who} <a href={`#src-${s.quote.src}`} className="text-signal">[{s.quote.src}]</a></div>
            </blockquote>
          )}
        </section>
      ))}
      {v.timeline.length > 0 && (
        <section className="mb-4">
          <h2 className="mb-2 text-[17px] font-bold text-ink">Timeline</h2>
          <ul className="flex flex-col gap-1 text-[13.5px] text-dim">
            {v.timeline.map((t, i) => (
              <li key={i}><span className="font-mono text-[11px] text-ink">{t.date}</span> {t.event}{t.src ? <> <a href={`#src-${t.src}`} className="text-signal">[{t.src}]</a></> : null}</li>
            ))}
          </ul>
        </section>
      )}
      <section className="mb-2">
        <h2 className="mb-2 text-[17px] font-bold text-ink">Evidence &amp; sources</h2>
        <ol className="flex list-decimal flex-col gap-1 pl-5 text-[13px] text-dim">
          {v.sources.map((s) => (
            <li key={s.n} id={`src-${s.n}`}>
              {s.href ? (
                s.external ? <a href={s.href} target="_blank" rel="noopener" className="text-signal hover:underline">{s.label}</a>
                           : <Link to={s.href} className="text-signal hover:underline">{s.label}</Link>
              ) : s.label}
              : {s.note}
            </li>
          ))}
        </ol>
      </section>
      <div className="font-mono text-[10px] text-faint">Last fact-checked: {v.updated}. Every claim cites its source.</div>
    </article>
  );
}
```

(`story` = `data?.story ?? null`.)

`web/src/screens/Doc.tsx` — after the Topics chips block add:

```tsx
      {detail.citedIn && detail.citedIn.length > 0 && (
        <div className="-mt-2 mb-4 flex flex-wrap items-center gap-[7px] font-mono text-[10px]">
          <span className="text-faint">CITED IN</span>
          {detail.citedIn.map((c) => (
            <Link key={c.slug} to={`/case/${c.slug}`} className="rounded-[7px] border border-line px-[9px] py-1 text-dim hover:border-signal hover:text-signal">{c.title}</Link>
          ))}
        </div>
      )}
```

`web/src/screens/Hub.tsx` `Stories` — use `s.href` for every story (drop the `threadId` filter): `<Link to={s.href} …>`.

- [ ] **Step 4: Run** `cd web && npx tsc --noEmit -p tsconfig.app.json && npx vitest run src/tests/case.test.tsx src/tests/hub.test.tsx` → new tests PASS; full web suite shows only pre-existing failures.

- [ ] **Step 5: Commit**

```bash
git add web/src/api/types.ts web/src/screens/Case.tsx web/src/screens/Doc.tsx web/src/screens/Hub.tsx web/src/tests/case.test.tsx web/src/tests/hub.test.tsx
git commit -m "feat(cases): SPA case stories, Cited in on docs, case stories under topics

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Deploy the main site

- [ ] **Step 1: Local check** — `cd web && npx vite build`; restart `worker-dev` (clear `/Users/laichan/code/tung/realufo-superpower/.wrangler/state/v3/cache` with an absolute-path `rm -rf` while stopped — the local Cache API memo is path-keyed); open `/case/socorro` and `/case/kaikoura` (crawler: `curl -s http://localhost:8787/case/socorro | grep -oE "<h1>[^<]*|<h2>[^<]*"`), screenshot the SPA case page.
- [ ] **Step 2: Deploy from a clean worktree of HEAD** (`npx wrangler d1 migrations list realufo-db --remote | tail -2` first — expect none pending; then `git worktree add --detach <scratchpad>/deploy-cases HEAD`, `pnpm install --frozen-lockfile --prefer-offline` in root and `web/`, `pnpm run deploy` with node 22 on PATH).
- [ ] **Step 3: Verify live + push**

```bash
curl -s https://realufo.org/case/socorro | grep -oE "<h1>[^<]*|Evidence &amp; sources|Last fact-checked" | head
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://realufo.org/stories/socorro/   # 301 → /case/socorro
git push origin <deployed sha>:build/app-foundation
git worktree remove --force <scratchpad>/deploy-cases
```

---

### Task 8: Old repo — 301 the 12 story URLs (user-approved push)

**Files (in `/Users/laichan/code/tung/war-gov-ufo-release`):**
- Modify: `src/data/stories.json`, `src/pages/stories/[slug].astro`, `src/pages/stories/index.astro`, `src/components/Footer.astro`, `URL-CONTRACT.txt`, `scripts/build-redirects.py`
- Regenerate: `_redirects` (and the sitemap via the repo's own script)

- [ ] **Step 1: Read the repo's `CLAUDE.md`** (URL contract, generated files, content rules) and create a branch: `git checkout -b feat/fold-case-stories-to-apex` from `main` (stash or leave the repo's unrelated uncommitted files untouched).

- [ ] **Step 2: Write the failing check** — create `scripts/test_moved_stories.py`:

```python
#!/usr/bin/env python3
"""Moved stories (stories.json movedTo) 301 to the apex before any 200 rewrite."""
import json, pathlib, subprocess, sys
REPO = pathlib.Path(__file__).resolve().parent.parent
stories = json.loads((REPO / "src/data/stories.json").read_text())
moved = {s["slug"]: s["movedTo"] for s in stories if s.get("movedTo")}
assert len(moved) == 12, f"expected 12 moved stories, got {len(moved)}"
out = subprocess.run([sys.executable, str(REPO / "scripts/build-redirects.py"), "--stdout"], capture_output=True, text=True, check=True).stdout
lines = [l for l in out.splitlines() if l and not l.startswith("#")]
first200 = next(i for i, l in enumerate(lines) if l.endswith(" 200"))
for slug, target in moved.items():
    for src in (f"/stories/{slug}/", f"/stories/{slug}"):
        rule = f"{src} {target} 301"
        assert rule in lines, f"missing: {rule}"
        assert lines.index(rule) < first200, f"after the 200 block: {rule}"
    assert f"/stories/{slug}/ /stories/{slug}/ 200" not in lines, f"still rewritten: {slug}"
print(f"ok: {len(moved)} moved stories redirect to the apex")
```

Run: `python3 scripts/test_moved_stories.py` → FAIL (`expected 12 moved stories, got 0`).

- [ ] **Step 3: Implement**
  - `src/data/stories.json`: add `"movedTo": "https://realufo.org/case/<slug>"` to the 12 entries.
  - `URL-CONTRACT.txt`: delete the 12 `/stories/<slug>/` lines.
  - `scripts/build-redirects.py`: add a `build_moved_block()` that reads `stories.json` and returns, for each entry with `movedTo`, `emit_rule(f"/stories/{slug}/", movedTo, 301)` and `emit_rule(f"/stories/{slug}", movedTo, 301)`, sorted, under a `# Moved to realufo.org (apex)` sentinel comment; in `render_redirects` append it **before** the 200 loop (right after the header lines). In `build_legacy_301_block`, legacy `.html` paths of moved stories point at `movedTo` instead of `/stories/<slug>/`.
  - `src/pages/stories/[slug].astro` `getStaticPaths`: `.filter((entry) => !entry.movedTo)` before `.map`.
  - `src/pages/stories/index.astro`: card `href={s.movedTo ?? \`/stories/${s.slug}/\`}` and the JSON-LD `hasPart` url `s.movedTo ?? \`https://release.realufo.org/stories/${s.slug}/\``.
  - `src/components/Footer.astro` featured stories: same `movedTo ?? …` for their hrefs (and anywhere else `grep -rn "/stories/\${" src` finds a story link).
  - Regenerate: `python3 scripts/build-redirects.py` and the sitemap per the repo's README/CLAUDE.md (e.g. `python3 scripts/build-sitemap.py`), then the repo's build (`pnpm build`) to confirm the 12 pages are no longer emitted (`ls dist/stories/socorro` → absent).

- [ ] **Step 4: Run** `python3 scripts/test_moved_stories.py` → `ok: 12 …`; `python3 scripts/build-redirects.py --check` → passes; `pnpm build` → success.

- [ ] **Step 5: Commit on the branch** (old repo; its own commit conventions per its CLAUDE.md, with the Co-Authored-By line) and **STOP — show the user `git diff main --stat` and the `_redirects` moved block; wait for OK.**

- [ ] **Step 6 (after OK): merge + push** — `git checkout main && git merge --no-ff feat/fold-case-stories-to-apex && git push origin main` (triggers `deploy-cf-pages.yml`). Watch the Action (`gh run watch` in that repo) until it succeeds.

- [ ] **Step 7: Verify the 24 old URLs**

```bash
for s in roswell kaikoura jal-1628 tehran socorro travis-walton shag-harbour ohare-2006 stephenville trans-en-provence manises falcon-lake; do for p in "/stories/$s/" "/stories/$s"; do curl -s -o /dev/null -w "$p %{http_code} %{redirect_url}\n" "https://release.realufo.org$p"; done; done
```

Expected: every line `301 https://realufo.org/case/<slug>`.

- [ ] **Step 8: IndexNow + memory** — `python3 crawler/indexnow.py` with the 12 `https://realufo.org/case/<slug>` URLs plus every `https://realufo.org/doc/<id>` cited by a story; append the release line (versions, commits, old-repo merge sha) and "next batch: 34 remaining stories + glossary + timeline" to project memory.
