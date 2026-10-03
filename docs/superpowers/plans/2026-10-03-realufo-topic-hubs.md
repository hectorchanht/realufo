# Topic Hubs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ten cross-release topic hubs (`/topic/<slug>`) with researched backgrounds, page-cited sources and related stories, linked from Browse, the footer, llms.txt and every member file's page.

**Architecture:** A pure rule registry (`worker/lib/topics.ts`) compiles to parameterised SQL; `topicMembers()` runs it once per topic and memoizes the id lists (1 h) as the single source of membership. Topics become a fifth `HubKind` in the existing hub system (API, crawler HTML, SPA Hub screen, Browse, sitemap, highlights). Hand-written background text lives in `worker/lib/topicText.ts`, researched against the archive and reviewed by the user before deploy.

**Tech Stack:** Cloudflare Worker (TypeScript, D1, Cache API), vitest + `@cloudflare/vitest-pool-workers`, React 18 + react-router + TanStack Query, Testing Library; crawler (Python) only for the post-deploy highlights run.

**Spec:** `docs/superpowers/specs/2026-10-03-realufo-topic-hubs-design.md`

## Global Constraints

- Membership = live AND (any `title` word OR any `summary` phrase OR `agency` in `agencies`) AND no `notTitle` word; then `include` (existing + live only) added, `exclude` removed. SQL `LIKE` with bound `%word%` values — never string-built SQL.
- `MIN_HUB_FILES` = 5 applies to topics; below it a topic has no hub (404) and no links.
- Topic hub title: `${entry.title}: ${count} Declassified UFO Files`; chip label = `entry.label`.
- Topic data line: `${n} declassified UAP files on this topic: ${kinds}.${years}` (existing `hubIntro` phrasing).
- Background: 2–4 sentences, every claim backed by a `sources` entry (2–5 archive files, PDF page numbers for `?p=N`); `lore` only where files contradict common lore. No AI-written background text.
- `/api/hubs` order: release, topic, agency, location, decade. Browse shows Topics first.
- Memo keys: `${origin}/__topics` (1 h). Existing `${origin}/__hubs` and page memo unchanged.
- The user reviews the 10 topic texts before deploy (Task 6 gate).
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; stage only files you touched (other sessions share this checkout).
- Worker tests: `npx vitest run -c worker/vitest.config.ts <files>` from repo root. Web tests: `cd web && npx vitest run <files>`; the web suite has 19 pre-existing failures (client, components, doc, theme) — compare against that baseline.

## Review Focus

- A source id whose record is missing or not live must be dropped from the topic page, not render a dead link — pinned in Task 3.
- An `include` id that doesn't exist or isn't live must not be counted as a member — pinned in Task 3.
- A topic with fewer than 5 members must 404 and must not appear on member doc pages — pinned in Task 3.
- A failing topic-map query must not break doc pages (they render with `topics: []`) — pinned in Task 3.
- Agency/release/location/decade hubs must not gain a topic block or `about` JSON-LD — pinned in Task 3 and Task 4.

---

## File Structure

- Create `worker/lib/topics.ts` — pure, import-free: `TopicRule`, `TopicDef`, `TopicSource`, `TopicText`, `TopicBlock`, `TOPIC_RULES`, `topicWhere`, `validTopic`.
- Create `worker/lib/topicText.ts` — pure: `TOPIC_TEXT: Record<slug, TopicText>` (researched content).
- Create `db/migrations/0031_hub_highlights_topic.sql` (use the next free number if 0031 is taken).
- Create `scripts/check_topic_sources.py` — verifies sources against prod D1.
- Modify `worker/lib/hubs.ts` (HubKind, HUB_KINDS, hubTitle, hubIntro), `worker/routes/hubs.ts` (topicMembers, listHubs, hubFilter, topicBlock, Hub.topic), `worker/routes/records.ts` (detail `topics`), `worker/lib/ssr.ts` (KIND_HEADING, topic blocks in hubBody, browseBody order, doc Topics row, docFooter), `worker/lib/pages.ts` (topic meta + `about`), `worker/routes/llms.ts` (KINDS).
- Web: `web/src/api/types.ts`, `web/src/screens/Hub.tsx`, `web/src/screens/Browse.tsx`, `web/src/components/SiteFooter.tsx`, `web/src/screens/Doc.tsx`.
- Tests: create `worker/tests/topics.spec.ts`, `worker/tests/topics-api.spec.ts`; modify `worker/tests/hubs-lib.spec.ts`, `worker/tests/meta.spec.ts`, `worker/tests/sitemap.spec.ts`, `web/src/tests/hub.test.tsx`, `web/src/tests/doc.test.tsx`.

---

### Task 1: Rule registry + SQL compiler

**Files:**
- Create: `worker/lib/topics.ts`
- Test: `worker/tests/topics.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (exported from `worker/lib/topics.ts`):
  - `interface TopicRule { title?: string[]; summary?: string[]; agencies?: string[]; notTitle?: string[] }`
  - `interface TopicDef { slug: string; label: string; title: string; rule: TopicRule; include?: string[]; exclude?: string[] }`
  - `interface TopicSource { id: string; page?: number; note: string }`
  - `interface TopicText { background: string; lore?: string; sources: TopicSource[] }`
  - `interface TopicBlock { background: string; lore: string | null; sources: { id: string; page: number | null; note: string; title: string }[]; stories: { slug: string; title: string; threadId: string | null }[] }`
  - `const TOPIC_RULES: TopicDef[]` (10 entries, registry order = display order)
  - `topicWhere(rule: TopicRule): { sql: string; binds: string[] }` — predicate over alias `r`
  - `validTopic(t: TopicDef): boolean`

- [ ] **Step 1: Write the failing tests**

Create `worker/tests/topics.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { TOPIC_RULES, topicWhere, validTopic } from "../lib/topics";

describe("topicWhere", () => {
  it("ORs title, summary and agency matches with bound values", () => {
    expect(topicWhere({ title: ["DIRD", "AAWSAP"], summary: ["AAWSAP"], agencies: ["Local Law Enforcement"] })).toEqual({
      sql: "(r.title LIKE ? OR r.title LIKE ? OR r.summary LIKE ? OR r.agency IN (SELECT value FROM json_each(?)))",
      binds: ["%DIRD%", "%AAWSAP%", "%AAWSAP%", '["Local Law Enforcement"]'],
    });
  });
  it("ANDs notTitle exclusions (NULL titles count as not matching)", () => {
    expect(topicWhere({ title: ["Flying Disc"], notTitle: ["62-HQ-83894"] })).toEqual({
      sql: "(r.title LIKE ?) AND coalesce(r.title,'') NOT LIKE ?",
      binds: ["%Flying Disc%", "%62-HQ-83894%"],
    });
  });
  it("an empty rule matches nothing", () => {
    expect(topicWhere({})).toEqual({ sql: "0", binds: [] });
  });
});

describe("TOPIC_RULES", () => {
  it("has the 10 approved topics, unique slugs, all valid", () => {
    expect(TOPIC_RULES.map((t) => t.slug)).toEqual([
      "aawsap", "mission-reports", "flying-discs", "apollo-nasa", "fbi-62-hq-83894",
      "project-blue-book", "police", "nuclear-sites", "aaro-case-resolutions", "congress",
    ]);
    expect(TOPIC_RULES.every(validTopic)).toBe(true);
  });
  it("validTopic rejects an entry with no positive rule and no includes", () => {
    expect(validTopic({ slug: "x", label: "X", title: "X", rule: { notTitle: ["a"] } })).toBe(false);
    expect(validTopic({ slug: "x", label: "X", title: "X", rule: {}, include: ["A-1"] })).toBe(true);
  });
  it("audit adjustments are in the registry", () => {
    const by = Object.fromEntries(TOPIC_RULES.map((t) => [t.slug, t]));
    expect(by["flying-discs"].rule.notTitle).toEqual(["62-HQ-83894"]);
    expect(by["nuclear-sites"].include).toEqual(expect.arrayContaining(["DOW-UAP-D094", "DOW-UAP-D017"]));
    expect(by["nuclear-sites"].exclude).toContain("DOW-UAP-D126");
    expect(by["congress"].exclude).toContain("059uap00013");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run -c worker/vitest.config.ts worker/tests/topics.spec.ts`
Expected: FAIL — cannot resolve `../lib/topics`.

- [ ] **Step 3: Implement `worker/lib/topics.ts`**

```ts
// Topic hubs (spec 2026-10-03-realufo-topic-hubs-design): cross-release groups
// defined by rules over title / summary / agency, plus hand-fixed include /
// exclude ids from the membership audit. Pure, no imports (the SPA imports the
// types). Background text lives in topicText.ts.

export interface TopicRule { title?: string[]; summary?: string[]; agencies?: string[]; notTitle?: string[] }
export interface TopicDef { slug: string; label: string; title: string; rule: TopicRule; include?: string[]; exclude?: string[] }
export interface TopicSource { id: string; page?: number; note: string }
export interface TopicText { background: string; lore?: string; sources: TopicSource[] }
export interface TopicBlock {
  background: string; lore: string | null;
  sources: { id: string; page: number | null; note: string; title: string }[];
  stories: { slug: string; title: string; threadId: string | null }[];
}

// Registry order = display order (Browse, footer). Audit: spec appendix.
export const TOPIC_RULES: TopicDef[] = [
  { slug: "aawsap", label: "AAWSAP & DIRDs", title: "AAWSAP & the DIRD Reports", rule: { title: ["DIRD", "AAWSAP"], summary: ["AAWSAP"] } },
  { slug: "mission-reports", label: "Mission reports (MISREPs)", title: "Military Mission Reports (MISREPs)", rule: { title: ["Mission Report"], summary: ["Mission Report (MISREP)"] } },
  { slug: "flying-discs", label: "Flying discs, 1947–1950s", title: "Flying Disc Files, 1947–1950s", rule: { title: ["Flying Disc", "Flying Saucer"], summary: ["flying disc", "flying saucer"], notTitle: ["62-HQ-83894"] } },
  { slug: "apollo-nasa", label: "Apollo & NASA crews", title: "Apollo, Gemini & Skylab Crew Reports", rule: { title: ["Apollo", "Gemini", "Mercury", "Skylab"] } },
  { slug: "fbi-62-hq-83894", label: "FBI file 62-HQ-83894", title: "FBI Flying Disc File 62-HQ-83894", rule: { title: ["62-HQ-83894"] } },
  { slug: "project-blue-book", label: "Project Blue Book", title: "Project Blue Book Files", rule: { title: ["Blue Book"], summary: ["Project Blue Book"] } },
  { slug: "police", label: "Police & law enforcement", title: "Police & Law Enforcement UFO Reports", rule: { agencies: ["Local Law Enforcement"], title: ["police", "sheriff"] } },
  {
    slug: "nuclear-sites", label: "Nuclear sites & Los Alamos", title: "UFOs, Nuclear Sites & Los Alamos",
    rule: { summary: ["Los Alamos", "atomic", "nuclear"] },
    include: ["DOW-UAP-D094", "DOW-UAP-D017"],
    exclude: ["DOW-UAP-D126"], // AAWSAP propulsion DIRD, not about sightings near sites
  },
  { slug: "aaro-case-resolutions", label: "AARO case resolutions", title: "AARO Case Resolutions", rule: { title: ["Case Resolution"] } },
  {
    slug: "congress", label: "Congress & hearings", title: "Congress, Hearings & the House Request",
    rule: { summary: ["On March 6, 2026, eight members of the U.S. House", "open hearing"] },
    include: ["CONGRESS-CHRG-119hhrg61718", "USG-UAP-D001"],
    exclude: ["059uap00013"], // Mexican Congress cable
  },
];

export function topicWhere(rule: TopicRule): { sql: string; binds: string[] } {
  const any: string[] = [];
  const binds: string[] = [];
  for (const w of rule.title ?? []) {
    any.push("r.title LIKE ?");
    binds.push(`%${w}%`);
  }
  for (const w of rule.summary ?? []) {
    any.push("r.summary LIKE ?");
    binds.push(`%${w}%`);
  }
  if (rule.agencies?.length) {
    any.push("r.agency IN (SELECT value FROM json_each(?))");
    binds.push(JSON.stringify(rule.agencies));
  }
  if (!any.length) return { sql: "0", binds: [] };
  const parts = [`(${any.join(" OR ")})`];
  for (const w of rule.notTitle ?? []) {
    parts.push("coalesce(r.title,'') NOT LIKE ?");
    binds.push(`%${w}%`);
  }
  return { sql: parts.join(" AND "), binds };
}

export const validTopic = (t: TopicDef) =>
  !!(t.rule.title?.length || t.rule.summary?.length || t.rule.agencies?.length || t.include?.length);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run -c worker/vitest.config.ts worker/tests/topics.spec.ts` → PASS. `npx tsc --noEmit -p .` → no output.

- [ ] **Step 5: Commit**

```bash
git add worker/lib/topics.ts worker/tests/topics.spec.ts
git commit -m "feat(topics): topic rule registry and parameterised SQL compiler

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Research and write the topic texts

**Files:**
- Create: `worker/lib/topicText.ts`
- Create: `scripts/check_topic_sources.py`
- Modify: `worker/lib/topics.ts` (only if research resolves the CIA-UAP-D022 open item: add it to `nuclear-sites.exclude` if its nuclear mention isn't about a nuclear site)
- Test: `worker/tests/topics.spec.ts` (append)

**Interfaces:**
- Consumes: `TOPIC_RULES`, `TopicText`, `TopicSource` (Task 1).
- Produces: `TOPIC_TEXT: Record<string, TopicText>` exported from `worker/lib/topicText.ts`, one entry per `TOPIC_RULES` slug.

- [ ] **Step 1: Write the failing test** — append to `worker/tests/topics.spec.ts`:

```ts
import { TOPIC_TEXT } from "../lib/topicText";

describe("TOPIC_TEXT", () => {
  it("every topic has a background (≤ 700 chars), optional lore, and 2–5 sources with positive pages", () => {
    for (const t of TOPIC_RULES) {
      const x = TOPIC_TEXT[t.slug];
      expect(x, t.slug).toBeDefined();
      expect(x.background.length, t.slug).toBeGreaterThan(80);
      expect(x.background.length, t.slug).toBeLessThanOrEqual(700);
      expect(x.sources.length, t.slug).toBeGreaterThanOrEqual(2);
      expect(x.sources.length, t.slug).toBeLessThanOrEqual(5);
      for (const s of x.sources) {
        expect(s.note.length, `${t.slug} ${s.id}`).toBeGreaterThan(3);
        if (s.page !== undefined) expect(Number.isInteger(s.page) && s.page > 0, `${t.slug} ${s.id}`).toBe(true);
      }
    }
    expect(Object.keys(TOPIC_TEXT).sort()).toEqual(TOPIC_RULES.map((t) => t.slug).sort());
  });
});
```

(Move the new `import` line to the top of the file with the other imports.)

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run -c worker/vitest.config.ts worker/tests/topics.spec.ts`
Expected: FAIL — cannot resolve `../lib/topicText`.

- [ ] **Step 3: Research each topic** (follow the user's research-first rule: archive documents first, then public coverage; flag where lore ≠ documents; PDF quotes cite their page).

For each of the 10 topics, in registry order:

1. List the members and read their summaries:
   ```bash
   npx wrangler d1 execute realufo-db --remote --json --command "SELECT id, title, substr(summary,1,400) s FROM records WHERE id IN (<member ids from the spec appendix>)"
   ```
2. Find page-level evidence for each claim you intend to make. Full text per page is in `record_text.pages` (JSON `[{n, text}]`) and the FTS table `record_fts(record_id, page, body)`:
   ```bash
   npx wrangler d1 execute realufo-db --remote --json --command "SELECT record_id, page, snippet(record_fts, 2, '[', ']', '…', 12) s FROM record_fts WHERE record_fts MATCH '\"Bigelow\"' LIMIT 10"
   ```
   Where the text layer is poor, open the PDF (`https://realufo.org/api/file/<id>` → PyMuPDF `page.get_text()`) and confirm the page number by reading it.
3. Check public coverage briefly (WebSearch) only to spot lore worth correcting; never cite outside sources in the text.
4. CIA-UAP-D022 (open item): read its summary/text; keep it in `nuclear-sites` only if the nuclear mention concerns a nuclear site or weapons facility; otherwise add `"CIA-UAP-D022"` to that entry's `exclude` in `worker/lib/topics.ts` and record the ruling in the ledger.

- [ ] **Step 4: Write `worker/lib/topicText.ts`**

Shape (one entry per slug; the strings come from Step 3 — every sentence in `background` must be supported by at least one `sources` entry, and `page` is the 1-based PDF page you read the claim on):

```ts
// Hand-written topic backgrounds (spec 2026-10-03-realufo-topic-hubs-design),
// researched against the archive files; every claim is backed by `sources`
// (PDF page = the ?p= deep link). Reviewed by the user before deploy.
import type { TopicText } from "./topics";

export const TOPIC_TEXT: Record<string, TopicText> = {
  aawsap: {
    background: "<2–4 sentences from Step 3>",
    lore: "<only if the files contradict common lore; else omit the key>",
    sources: [
      { id: "DOW-UAP-D111", page: 1, note: "<what this page shows>" },
      { id: "DOW-UAP-D110", page: 2, note: "<…>" },
    ],
  },
  // … mission-reports, flying-discs, apollo-nasa, fbi-62-hq-83894,
  //   project-blue-book, police, nuclear-sites, aaro-case-resolutions, congress
};
```

Known anchors from earlier research (re-verify the page numbers before using them): DOW-UAP-D111 box 26 = $21,948,810.00 contract to Bigelow Aerospace Advanced Space Studies; DOW-UAP-D110 objectives "through the year 2050"; DOW-UAP-D094 p.10 Oak Ridge / Hanford; DOW-UAP-D154 p.3 Ruppelt on Los Alamos; DOE-UAP-D004 p.2 (Secret, room P-162, 16 Feb 1949); AARO-AARO_GoFast_Case_Resolution_Card_Methodology_Final.pdf (parallax method); AARO-AARO_Puerto_Rico_UAP_Case_Resolution.pdf (lanterns).

- [ ] **Step 5: Write and run the source check** — create `scripts/check_topic_sources.py`:

```python
#!/usr/bin/env python3
"""Verify topic sources (worker/lib/topicText.ts) against prod D1: every id exists
and is live, and every page is within the file's page count (record_text.total_pages)."""
import json, re, subprocess, sys

src = open("worker/lib/topicText.ts").read()
pairs = re.findall(r'\{\s*id:\s*"([^"]+)"(?:,\s*page:\s*(\d+))?', src)
ids = sorted({i for i, _ in pairs})
sql = ("SELECT r.id, r.status, t.total_pages FROM records r LEFT JOIN record_text t ON t.record_id=r.id "
       "WHERE r.id IN (" + ",".join("'" + i.replace("'", "''") + "'" for i in ids) + ")")
out = subprocess.run(["npx", "wrangler", "d1", "execute", "realufo-db", "--remote", "--json", "--command", sql],
                     capture_output=True, text=True).stdout
rows = {r["id"]: r for r in json.loads(out[out.index("["):out.rindex("]") + 1])[0]["results"]}
bad = []
for i, p in pairs:
    r = rows.get(i)
    if not r or r["status"] != "live":
        bad.append(f"{i}: missing or not live")
    elif p and r["total_pages"] and int(p) > int(r["total_pages"]):
        bad.append(f"{i}: page {p} > {r['total_pages']} pages")
print("\n".join(bad) or f"ok: {len(pairs)} sources, {len(ids)} files")
sys.exit(1 if bad else 0)
```

Run: `python3 scripts/check_topic_sources.py` → Expected: `ok: N sources, M files`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run -c worker/vitest.config.ts worker/tests/topics.spec.ts` → PASS. `npx tsc --noEmit -p .` → no output.

- [ ] **Step 7: Commit**

```bash
git add worker/lib/topicText.ts scripts/check_topic_sources.py worker/tests/topics.spec.ts worker/lib/topics.ts
git commit -m "feat(topics): researched topic backgrounds with page-cited sources + prod source check

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Topic hubs in the Worker API (membership, hubs, doc links, migration)

**Files:**
- Create: `db/migrations/0031_hub_highlights_topic.sql`
- Modify: `worker/lib/hubs.ts` (HubKind, HUB_KINDS, hubTitle, hubIntro)
- Modify: `worker/routes/hubs.ts` (topicMembers, listHubs, listHubsCached, hubFilter, topicBlock, Hub.topic, loadHub)
- Modify: `worker/routes/records.ts` (detail `topics`)
- Test: create `worker/tests/topics-api.spec.ts`; modify `worker/tests/hubs-lib.spec.ts`

**Interfaces:**
- Consumes: `TOPIC_RULES`, `topicWhere`, `TopicBlock` (Task 1); `TOPIC_TEXT` (Task 2); `cachedJson` (`worker/lib/cache.ts`); `docTitle` (`worker/lib/ssr.ts`); `MIN_HUB_FILES` (`worker/lib/hubs.ts`).
- Produces:
  - `HubKind = "release" | "topic" | "agency" | "location" | "decade"` (worker/lib/hubs.ts)
  - `topicMembers(env: Env, origin: string): Promise<Record<string, string[]>>` (worker/routes/hubs.ts)
  - `Hub.topic?: TopicBlock` — present on topic hubs only
  - Record detail `topics: { slug: string; label: string }[]` (worker/routes/records.ts `loadRecord` return)

- [ ] **Step 1: Write the failing tests**

In `worker/tests/hubs-lib.spec.ts`, inside the existing `hubTitle` test, add:

```ts
    expect(hubTitle({ kind: "topic", slug: "aawsap", label: "AAWSAP & DIRDs", count: 44 })).toBe("AAWSAP & the DIRD Reports: 44 Declassified UFO Files");
```

Create `worker/tests/topics-api.spec.ts`:

```ts
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../index";
import { seedTestDB } from "./helpers";
import { topicMembers } from "../routes/hubs";
import { TOPIC_TEXT } from "../lib/topicText";

const SRC = TOPIC_TEXT.aawsap.sources[0].id; // a real source id, inserted below as a member
beforeAll(async () => {
  await seedTestDB(env.DB);
  const ins = env.DB.prepare("INSERT INTO records(id,archive,agency,title,summary,kind,status) VALUES (?,?,?,?,?,?,?)");
  await env.DB.batch([
    ...[1, 2, 3, 4].map((n) => ins.bind(`TOPIC-T${n}`, "wargov", "DoW", `TOPIC-T${n}, AAWSAP DIRD, Test ${n}`, "x", "pdf", "live")),
    ins.bind(SRC, "wargov", "DoW", `${SRC}, AAWSAP source file`, "x", "pdf", "live"),
    ins.bind("TOPIC-DEAD", "wargov", "DoW", "TOPIC-DEAD, AAWSAP DIRD, withdrawn", "x", "pdf", "failed"),
    ins.bind("DOW-UAP-D126", "wargov", "DoW", "DOW-UAP-D126, propulsion", "nuclear propulsion study", "pdf", "live"),
    ins.bind("DOW-UAP-D094", "wargov", "DoW", "DOW-UAP-D094, Analysis of Flying Object Incidents", "x", "pdf", "live"),
    env.DB.prepare("INSERT INTO articles(slug,title,body,thread_id) VALUES ('tstory','Test story','B','ar_tstory')"),
    env.DB.prepare("INSERT INTO article_records(slug,record_id,pos,label,evidence) VALUES ('tstory','TOPIC-T1',0,'L','E')"),
  ]);
});

const call = async (path: string, over: Record<string, unknown> = {}) => {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request("https://topics.test" + path), { ...env, ...over } as any, ctx);
  await waitOnExecutionContext(ctx);
  return res;
};

describe("topic membership", () => {
  it("applies rules, live filter, include and exclude", async () => {
    const m = await topicMembers(env as any, "https://members.test");
    expect(m.aawsap).toEqual(expect.arrayContaining(["TOPIC-T1", "TOPIC-T2", "TOPIC-T3", "TOPIC-T4", SRC]));
    expect(m.aawsap).not.toContain("TOPIC-DEAD");
    expect(m["nuclear-sites"]).toContain("DOW-UAP-D094");      // include
    expect(m["nuclear-sites"]).not.toContain("DOW-UAP-D126");  // exclude beats the rule
    expect(m["nuclear-sites"]).not.toContain("DOW-UAP-D017");  // include of a missing id is ignored
  });
});

describe("topic hub API", () => {
  it("lists topic hubs with ≥ 5 files, after releases", async () => {
    const { hubs } = (await (await call("/api/hubs")).json()) as any;
    const keys = hubs.map((h: any) => `${h.kind}/${h.slug}`);
    expect(keys).toContain("topic/aawsap");
    expect(keys).not.toContain("topic/police");
    expect(keys.indexOf("release/2")).toBeLessThan(keys.indexOf("topic/aawsap"));
    expect(keys.indexOf("topic/aawsap")).toBeLessThan(keys.indexOf("agency/department-of-war"));
  });

  it("topic hub: title, members, background, sources (live only), stories", async () => {
    const res = await call("/api/hubs/topic/aawsap");
    expect(res.status).toBe(200);
    const h: any = await res.json();
    expect(h.title).toMatch(/^AAWSAP & the DIRD Reports: \d+ Declassified UFO Files$/);
    expect(h.intro).toMatch(/declassified UAP files on this topic: /);
    expect(h.records.map((r: any) => r.id)).toEqual(expect.arrayContaining(["TOPIC-T1", SRC]));
    expect(h.topic.background).toBe(TOPIC_TEXT.aawsap.background);
    expect(h.topic.sources.map((s: any) => s.id)).toEqual([SRC]); // the other sources aren't in the test DB
    expect(h.topic.sources[0].title).toContain("AAWSAP source file");
    expect(h.topic.stories).toEqual([{ slug: "tstory", title: "Test story", threadId: "ar_tstory" }]);
  });

  it("small topics 404; other kinds have no topic block", async () => {
    expect((await call("/api/hubs/topic/police")).status).toBe(404);
    expect((await call("/api/hubs/topic/nope")).status).toBe(404);
    const fbi: any = await (await call("/api/hubs/agency/fbi")).json();
    expect(fbi).not.toHaveProperty("topic");
  });

  it("doc detail lists its live topics; non-members get none", async () => {
    const d: any = await (await call("/api/records/TOPIC-T1")).json();
    expect(d.topics).toEqual([{ slug: "aawsap", label: "AAWSAP & DIRDs" }]);
    const n: any = await (await call("/api/records/DOW-UAP-D094")).json();
    expect(n.topics).toEqual([]); // nuclear-sites has < 5 members here
  });

  it("a failing topic query leaves doc pages working with no topics", async () => {
    const DB = { prepare: (sql: string) => (sql.includes("LIKE ?") && sql.includes("SELECT r.id FROM records r") ? (() => { throw new Error("D1 down"); })() : env.DB.prepare(sql)), batch: env.DB.batch.bind(env.DB) };
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("https://topicfail.test/api/records/TOPIC-T1"), { ...env, DB } as any, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).topics).toEqual([]);
  });

  it("hub_highlights accepts kind='topic' after the migration", async () => {
    await env.DB.prepare("INSERT INTO hub_highlights(kind,slug,lede,picks,members_hash) VALUES ('topic','aawsap','L','[]','h')").run();
    const row = await env.DB.prepare("SELECT kind FROM hub_highlights WHERE kind='topic' AND slug='aawsap'").first();
    expect(row).toEqual({ kind: "topic" });
  });
});
```

Notes: `/api/records/:id` must stay 200 when `listHubsCached` and `topicMembers` throw — check how `loadRecord`'s hub lookup already catches (it does, `listHubsCached(...).catch`). The failing-DB stub throws only for the topic member query (`SELECT r.id FROM records r … LIKE ?`); `listHubs` also calls `topicMembers` and will throw — `loadRecord` already catches the hub list, so both catches are needed (Step 3).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run -c worker/vitest.config.ts worker/tests/topics-api.spec.ts worker/tests/hubs-lib.spec.ts`
Expected: FAIL (no topic hubs, no `topics` on detail, migration CHECK rejects 'topic', hubTitle).

- [ ] **Step 3: Implement**

`db/migrations/0031_hub_highlights_topic.sql` (check `ls db/migrations | tail -1` first; use the next free number):

```sql
-- Topic hubs (spec 2026-10-03-realufo-topic-hubs-design): allow kind='topic'.
-- SQLite can't alter a CHECK constraint, so rebuild the table and keep its rows.
CREATE TABLE hub_highlights_new (
  kind          TEXT NOT NULL CHECK (kind IN ('release','agency','location','decade','topic')),
  slug          TEXT NOT NULL,
  lede          TEXT NOT NULL,
  picks         TEXT NOT NULL,
  members_hash  TEXT NOT NULL,
  generated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (kind, slug)
);
INSERT INTO hub_highlights_new (kind, slug, lede, picks, members_hash, generated_at)
  SELECT kind, slug, lede, picks, members_hash, generated_at FROM hub_highlights;
DROP TABLE hub_highlights;
ALTER TABLE hub_highlights_new RENAME TO hub_highlights;
```

`worker/lib/hubs.ts`:

```ts
import { TOPIC_RULES } from "./topics";
export type HubKind = "release" | "topic" | "agency" | "location" | "decade";
export const HUB_KINDS: HubKind[] = ["release", "topic", "agency", "location", "decade"];
```

In `hubTitle`, before the location line:

```ts
  if (h.kind === "topic") return `${TOPIC_RULES.find((t) => t.slug === h.slug)?.title ?? h.label}: ${h.count} Declassified UFO Files`;
```

In `hubIntro`, extend the `phrase` chain — replace

```ts
      : h.kind === "decade"
        ? `about incidents in the ${h.slug}`
        : entry(h.kind, h.slug)?.phrase ?? `about ${h.label}`;
```

with

```ts
      : h.kind === "decade"
        ? `about incidents in the ${h.slug}`
        : h.kind === "topic"
          ? "on this topic"
          : entry(h.kind, h.slug)?.phrase ?? `about ${h.label}`;
```

`worker/routes/hubs.ts` — imports:

```ts
import { TOPIC_RULES, topicWhere, type TopicBlock } from "../lib/topics";
import { TOPIC_TEXT } from "../lib/topicText";
```

(`docTitle` is already imported from `../lib/ssr` by the release-tracker work; add it if not.)

Add `topic?: TopicBlock;` to `interface Hub`.

Add after `listHubsCached`:

```ts
// One source of truth for topic membership: each rule runs once, include/exclude
// applied, memoized like the hub list (1h per colo).
export const topicMembers = async (env: Env, origin: string): Promise<Record<string, string[]>> =>
  (await cachedJson(`${origin}/__topics`, async () => {
    const out: Record<string, string[]> = {};
    for (const t of TOPIC_RULES) {
      const w = topicWhere(t.rule);
      const ids = new Set(
        (await env.DB.prepare(`SELECT r.id FROM records r WHERE r.status='live' AND ${w.sql}`).bind(...w.binds).all<{ id: string }>()).results.map((r) => r.id)
      );
      if (t.include?.length) {
        const inc = await env.DB.prepare("SELECT id FROM records WHERE status='live' AND id IN (SELECT value FROM json_each(?))")
          .bind(JSON.stringify(t.include))
          .all<{ id: string }>();
        for (const r of inc.results) ids.add(r.id);
      }
      for (const x of t.exclude ?? []) ids.delete(x);
      out[t.slug] = [...ids].sort();
    }
    return out;
  })) ?? {};

async function topicBlock(env: Env, slug: string, members: string[]): Promise<TopicBlock> {
  const text = TOPIC_TEXT[slug];
  const srcIds = (text?.sources ?? []).map((s) => s.id);
  const [recs, stories] = await Promise.all([
    env.DB.prepare("SELECT id,title,kind FROM records WHERE status='live' AND id IN (SELECT value FROM json_each(?))")
      .bind(JSON.stringify(srcIds))
      .all<{ id: string; title: string; kind: string }>(),
    env.DB.prepare(
      `SELECT a.slug, a.title, a.thread_id threadId, max(a.created_at) c FROM articles a JOIN article_records ar ON ar.slug=a.slug
        WHERE ar.record_id IN (SELECT value FROM json_each(?)) GROUP BY a.slug ORDER BY c DESC`
    )
      .bind(JSON.stringify(members))
      .all<{ slug: string; title: string; threadId: string | null }>(),
  ]);
  const byId = new Map(recs.results.map((r) => [r.id, r]));
  return {
    background: text?.background ?? "", lore: text?.lore ?? null,
    sources: (text?.sources ?? []).flatMap((s) => {
      const r = byId.get(s.id);
      return r ? [{ id: s.id, page: s.page ?? null, note: s.note, title: docTitle(r.title, r.id, r.kind) }] : [];
    }),
    stories: stories.results.map((s) => ({ slug: s.slug, title: s.title, threadId: s.threadId })),
  };
}
```

Change `listHubs` to take the origin and add topics after releases:

```ts
export async function listHubs(env: Env, origin: string): Promise<HubSummary[]> {
  const [f, members] = await Promise.all([facetCounts(env), topicMembers(env, origin)]);
  const sum = (values: string[], rows: { name: string; count: number }[]) =>
    rows.filter((r) => values.includes(r.name)).reduce((n, r) => n + r.count, 0);
  return [
    ...f.releases.map((r) => ({ kind: "release" as const, slug: String(r.no), label: releaseLabel(r.no, r.date), count: r.count })),
    ...TOPIC_RULES.map((t) => ({ kind: "topic" as const, slug: t.slug, label: t.label, count: (members[t.slug] ?? []).length })),
    ...AGENCY_HUBS.map((h) => ({ kind: "agency" as const, slug: h.slug, label: h.label, count: sum(h.values, f.agencies), values: h.values })),
    ...LOCATION_HUBS.map((h) => ({ kind: "location" as const, slug: h.slug, label: h.label, count: sum(h.values, f.locations), values: h.values })),
    ...f.decades.map((d) => ({ kind: "decade" as const, slug: `${d.decade}s`, label: `${d.decade}s`, count: d.count })),
  ].filter((h) => h.count >= MIN_HUB_FILES);
}

export const listHubsCached = async (env: Env, origin: string) =>
  (await cachedJson(`${origin}/__hubs`, () => listHubs(env, origin))) ?? [];
```

(Keep the existing `ponytail:` comment above `listHubsCached`. `grep -rn "listHubs(" worker` and pass `origin` at any other call site.)

`hubFilter` — add a topic branch at the top (it gains an `origin` parameter; update its single caller in `loadHub`):

```ts
async function hubFilter(env: Env, h: HubSummary, origin: string) {
  if (h.kind === "topic") {
    const members = (await topicMembers(env, origin))[h.slug] ?? [];
    return { where: "r.id IN (SELECT value FROM json_each(?))", bind: [JSON.stringify(members)], release: null, members };
  }
  …existing branches unchanged…
```

In `loadHub`: call `hubFilter(env, me, origin)`, then add to the returned object (next to the release spread):

```ts
    ...(me.kind === "topic" ? { topic: await topicBlock(env, me.slug, (sel as { members: string[] }).members) } : {}),
```

`worker/routes/records.ts` — imports:

```ts
import { listHubsCached, topicMembers } from "./hubs";
import { TOPIC_RULES } from "../lib/topics";
import { MIN_HUB_FILES } from "../lib/hubs";
```

Add to the `Promise.all` in `loadRecord`, after the `listHubsCached(...).catch(...)` entry (and add `topicMap` to the destructured names in the same position):

```ts
    // Topic links are garnish too: a failing topic query must not break the doc.
    topicMembers(env, origin).catch((e) => {
      console.error("topic members failed", e);
      return {} as Record<string, string[]>;
    }),
```

and add to the returned object:

```ts
    topics: TOPIC_RULES.filter((t) => {
      const m = topicMap[t.slug] ?? [];
      return m.length >= MIN_HUB_FILES && m.includes(id);
    }).map((t) => ({ slug: t.slug, label: t.label })),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run -c worker/vitest.config.ts` → all pass (the whole suite: `HubKind` widened, `listHubs` signature changed). Fix any test that called `listHubs(env)` directly by adding an origin argument. `npx tsc --noEmit -p .` → no output.

- [ ] **Step 5: Commit**

```bash
git add db/migrations/0031_hub_highlights_topic.sql worker/lib/hubs.ts worker/routes/hubs.ts worker/routes/records.ts worker/tests/topics-api.spec.ts worker/tests/hubs-lib.spec.ts
git commit -m "feat(topics): topic hubs in the API — cached membership, topic block, doc topics, highlights migration

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Crawler HTML — topic pages, doc Topics row, Browse, llms, sitemap

**Files:**
- Modify: `worker/lib/ssr.ts` (KIND_HEADING, `HubPageData.topic`, `DocData.topics`, `topicHtml`, `hubBody`, `browseBody`, `docBody`, `docFooter`)
- Modify: `worker/lib/pages.ts` (`hubPage`: description + `about`)
- Modify: `worker/routes/llms.ts` (KINDS)
- Test: `worker/tests/meta.spec.ts`, `worker/tests/sitemap.spec.ts`

**Interfaces:**
- Consumes: `Hub.topic: TopicBlock`, detail `topics` (Task 3); `TopicBlock` type (Task 1).
- Produces: crawler HTML only.

- [ ] **Step 1: Write the failing tests**

Append to `worker/tests/meta.spec.ts`:

```ts
describe("topic pages (crawler HTML)", () => {
  const fakeAssets = {
    fetch: async () =>
      new Response('<html><head><!--META--></head><body><div id="root"></div></body></html>', { headers: { "content-type": "text/html" } }),
  };
  const get = async (path: string) => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("https://topicpages.test" + path, { headers: { accept: "text/html" } }), { ...env, ASSETS: fakeAssets } as any, ctx);
    await waitOnExecutionContext(ctx);
    return res.text();
  };
  beforeAll(async () => {
    const ins = env.DB.prepare("INSERT INTO records(id,archive,agency,title,summary,kind,status) VALUES (?,?,?,?,?,?,?)");
    await env.DB.batch([1, 2, 3, 4, 5].map((n) => ins.bind(`TP-${n}`, "wargov", "DoW", `TP-${n}, AAWSAP DIRD, Page test ${n}`, "x", "pdf", "live")));
  });

  it("topic page: title with count, data line, about JSON-LD", async () => {
    const html = await get("/topic/aawsap");
    expect(html).toMatch(/<h1>AAWSAP &amp; the DIRD Reports: \d+ Declassified UFO Files<\/h1>/);
    expect(html).toContain("declassified UAP files on this topic");
    expect(html).toContain('"about":{"@type":"Thing","name":"AAWSAP & DIRDs"}'); // JSON-LD: only "<" is escaped
    expect(html).toContain('<a href="/doc/TP-1">');
  });

  it("doc page lists its topics with links", async () => {
    const html = await get("/doc/TP-1");
    expect(html).toContain('Topics: <a href="/topic/aawsap">AAWSAP &amp; DIRDs</a>');
  });

  it("browse lists topics first; agency hubs get no about", async () => {
    const browse = await get("/browse");
    expect(browse.indexOf("<h2>Topics</h2>")).toBeGreaterThan(-1);
    expect(browse.indexOf("<h2>Topics</h2>")).toBeLessThan(browse.indexOf("<h2>Releases</h2>"));
    const agency = await get("/agency/fbi");
    expect(agency).not.toContain('"about"');
  });
});
```

In `worker/tests/sitemap.spec.ts`, insert 5 AAWSAP test records before the sitemap request in the main test (same `ins` batch as above with ids `SM-1`…`SM-5`) and add:

```ts
    expect(xml).toContain("<loc>https://realufo.org/topic/aawsap</loc>");
```

(If the sitemap test calls `worker.fetch` once at module level, add a separate `it` with its own inserts and a fresh request origin so the hub memo is rebuilt.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run -c worker/vitest.config.ts worker/tests/meta.spec.ts worker/tests/sitemap.spec.ts`
Expected: FAIL on the new assertions.

- [ ] **Step 3: Implement**

`worker/lib/ssr.ts`:

Add the import: `import type { TopicBlock } from "./topics";`

`KIND_HEADING` gains `topic: "Topics"`:

```ts
const KIND_HEADING: Record<string, string> = { release: "Releases", topic: "Topics", agency: "Agencies", location: "Locations", decade: "Decades" };
```

`HubPageData` gains `topic?: TopicBlock | null;`. `DocData` gains `topics?: { slug: string; label: string }[];`. Widen `DocData.hubs`' key union to include `"topic"` only if TypeScript requires it (it shouldn't — topics use the separate `topics` field).

Add (next to `releaseBlockHtml`):

```ts
const topicHtml = (t: TopicBlock) =>
  [
    paras(t.background),
    t.lore ? `<p><strong>Where the lore differs:</strong> ${esc(t.lore)}</p>` : "",
    t.sources.length
      ? `<section><h2>Sources in the archive</h2><ul>${t.sources
          .map((s) => `<li>${a({ href: `${docHref(s.id)}${s.page ? `?p=${s.page}` : ""}`, text: `${s.title}${s.page ? ` — p. ${s.page}` : ""}` })}: ${esc(s.note)}</li>`)
          .join("")}</ul></section>`
      : "",
  ].join("");

const storiesHtml = (t: TopicBlock) =>
  section("Related stories", t.stories.filter((s) => s.threadId).map((s) => ({ href: threadHref(s.threadId as string), text: s.title })));
```

In `hubBody`, insert `h.topic ? topicHtml(h.topic) : "",` right after the `<h1>` line, and `h.topic ? storiesHtml(h.topic) : "",` right after `highlightsHtml(h.highlights),`.

`browseBody` — topics first:

```ts
    ...["topic", "release", "agency", "location", "decade"].map((k) => section(KIND_HEADING[k], hubLinks(hubs.filter((h) => h.kind === k))))
```

`docBody` — after the `<dl>…</dl>` entry add:

```ts
    d.topics?.length ? `<p>Topics: ${d.topics.map((t) => a({ href: hubHref("topic", t.slug), text: t.label })).join(" · ")}</p>` : "",
```

`docFooter` — add before `.filter(...)`:

```ts
    ...(d.topics ?? []).map((t) => ({ href: hubHref("topic", t.slug), text: `More on ${t.label}` })),
```

(the array literal becomes `[ h.release && …, …, h.decade && …, ...topicLinks ]`).

`worker/lib/pages.ts`, in `hubPage` `meta`:

```ts
        description: h.topic
          ? `${h.topic.background.split(/(?<=\.)\s/)[0]} ${h.intro}`
          : h.release ? `${h.intro} Agencies: ${agencyList(h.release.info, 3)}.` : h.intro,
```

and inside `jsonLd`, after `description: h.intro,`:

```ts
          ...(h.topic ? { about: { "@type": "Thing", name: TOPIC_RULES.find((t) => t.slug === h.slug)?.label ?? h.title } } : {}),
```

with `import { TOPIC_RULES } from "./topics";`.

`worker/routes/llms.ts`:

```ts
const KINDS: [HubKind, string][] = [["topic", "Topics"], ["release", "Releases"], ["agency", "Agencies"], ["location", "Locations"], ["decade", "Decades"]];
```

The sitemap already lists every hub from `listHubsCached` — no change expected; if the test fails, add `topic` wherever the sitemap filters hub kinds.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run -c worker/vitest.config.ts` → all pass. `npx tsc --noEmit -p .` → no output.

- [ ] **Step 5: Commit**

```bash
git add worker/lib/ssr.ts worker/lib/pages.ts worker/routes/llms.ts worker/tests/meta.spec.ts worker/tests/sitemap.spec.ts
git commit -m "feat(topics): topic pages, doc Topics row, Browse/llms/sitemap in crawler HTML

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: SPA — topic hub blocks, Browse, footer, doc topics

**Files:**
- Modify: `web/src/api/types.ts` (HubKind, Hub.topic, RecordDetail.topics)
- Modify: `web/src/screens/Hub.tsx` (KIND_LABEL/KIND_PLURAL, TopicIntro, Stories)
- Modify: `web/src/screens/Browse.tsx` (KINDS order)
- Modify: `web/src/components/SiteFooter.tsx` (GROUPS)
- Modify: `web/src/screens/Doc.tsx` (topics chips, docFooterLinks)
- Test: `web/src/tests/hub.test.tsx`, `web/src/tests/doc.test.tsx`

**Interfaces:**
- Consumes: `/api/hubs/topic/:slug` → `Hub` with `topic: TopicBlock`; `/api/records/:id` → `topics` (Task 3). `TopicBlock` type-only from `../../../worker/lib/topics` (import-free).
- Produces: UI only.

- [ ] **Step 1: Write the failing tests**

Append to `web/src/tests/hub.test.tsx` (reuses `useHubMock`, `useHubsMock`, `renderAt`; add `<Route path="/topic/:slug" element={<Hub kind="topic" />} />` to `renderAt`'s `<Routes>`):

```tsx
const aawsap: HubData = {
  kind: "topic", slug: "aawsap", title: "AAWSAP & the DIRD Reports: 44 Declassified UFO Files",
  intro: "44 declassified UAP files on this topic: 44 PDFs. Incidents span 2009–2010.",
  stats: { files: 44, pdf: 44, video: 0, image: 0, from: "2009", to: "2010" },
  records: [], siblings: [], highlights: null,
  topic: {
    background: "AAWSAP was a Defense Intelligence Agency program.",
    lore: "Popular accounts call it a crash-retrieval program.",
    sources: [{ id: "DOW-UAP-D111", page: 3, note: "contract award", title: "DOW-UAP-D111 — AAWSAP Solicitation" }],
    stories: [{ slug: "warp-drives", title: "Warp drives on the Pentagon's dime", threadId: "ar_warp-drives" }],
  },
};

describe("topic hub blocks", () => {
  it("renders background, lore, page-linked sources and related stories", () => {
    useHubMock.mockReturnValue({ data: aawsap, isLoading: false });
    renderAt("/topic/aawsap");
    expect(screen.getByText("AAWSAP was a Defense Intelligence Agency program.")).toBeInTheDocument();
    expect(screen.getByText(/crash-retrieval program/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "DOW-UAP-D111 — AAWSAP Solicitation — p. 3" }).getAttribute("href")).toBe("/doc/DOW-UAP-D111?p=3");
    expect(screen.getByRole("link", { name: "Warp drives on the Pentagon's dime" }).getAttribute("href")).toBe("/thread/ar_warp-drives");
  });

  it("Browse shows Topics first", () => {
    useHubsMock.mockReturnValue({ data: { hubs: [
      { kind: "release", slug: "6", label: "Release 06 · 18 Sep 2026", count: 74 },
      { kind: "topic", slug: "aawsap", label: "AAWSAP & DIRDs", count: 44 },
    ] }, isLoading: false });
    renderAt("/browse");
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings.indexOf("TOPICS")).toBeLessThan(headings.indexOf("RELEASES"));
    expect(screen.getByRole("link", { name: "AAWSAP & DIRDs · 44" }).getAttribute("href")).toBe("/topic/aawsap");
  });
});
```

Append to `web/src/tests/doc.test.tsx`, inside `describe("Doc", …)`:

```tsx
  it("shows the file's topics as links", () => {
    useRecordMock.mockReturnValue({
      data: { ...mockDetail, topics: [{ slug: "aawsap", label: "AAWSAP & DIRDs" }] },
      isLoading: false,
    });
    renderDoc();
    expect(screen.getByRole("link", { name: "AAWSAP & DIRDs" }).getAttribute("href")).toBe("/topic/aawsap");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npx vitest run src/tests/hub.test.tsx src/tests/doc.test.tsx`
Expected: the 3 new tests FAIL (plus doc.test's pre-existing baseline failures).

- [ ] **Step 3: Implement**

`web/src/api/types.ts`:

```ts
export type HubKind = "release" | "topic" | "agency" | "location" | "decade";
export type { TopicBlock } from "../../../worker/lib/topics";
```

Add to `interface Hub`: `topic?: import("../../../worker/lib/topics").TopicBlock | null;`. Add to `RecordDetail` (next to `hubs?: HubLinks;`): `topics?: { slug: string; label: string }[];`.

`web/src/screens/Hub.tsx`:

```tsx
export const KIND_LABEL: Record<HubKind, string> = { release: "RELEASE", topic: "TOPIC", agency: "AGENCY", location: "LOCATION", decade: "DECADE" };
export const KIND_PLURAL: Record<HubKind, string> = { release: "RELEASES", topic: "TOPICS", agency: "AGENCIES", location: "LOCATIONS", decade: "DECADES" };
```

Add `import type { TopicBlock } from "../api/types";`. Render `{data.topic && <TopicIntro t={data.topic} />}` right after the `<h1>`, and `{data.topic && <Stories t={data.topic} />}` right after `{data.highlights && <Highlights … />}`. Add at the bottom:

```tsx
function TopicIntro({ t }: { t: TopicBlock }) {
  return (
    <div className="mb-4">
      <p className="mb-2 text-[14.5px] leading-[1.65] text-ink">{t.background}</p>
      {t.lore && (
        <p className="mb-2 text-[13.5px] leading-[1.6] text-dim">
          <span className="font-semibold text-amber">Where the lore differs:</span> {t.lore}
        </p>
      )}
      {t.sources.length > 0 && (
        <section aria-labelledby="topic-sources" className="mb-2">
          <h2 id="topic-sources" className="mb-1 font-mono text-[11px] font-semibold tracking-[.5px] text-ink">SOURCES IN THE ARCHIVE</h2>
          <ul className="flex flex-col gap-1 text-[13px] leading-[1.5] text-dim">
            {t.sources.map((s) => (
              <li key={`${s.id}-${s.page}`}>
                <Link to={`/doc/${encodeURIComponent(s.id)}${s.page ? `?p=${s.page}` : ""}`} className="text-signal hover:underline">
                  {s.title}{s.page ? ` — p. ${s.page}` : ""}
                </Link>
                : {s.note}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Stories({ t }: { t: TopicBlock }) {
  const items = t.stories.filter((s) => s.threadId);
  if (!items.length) return null;
  return (
    <section aria-labelledby="topic-stories" className="mb-5">
      <h2 id="topic-stories" className="mb-2 font-mono text-[11px] font-semibold tracking-[.5px] text-ink">RELATED STORIES</h2>
      <ul className="flex flex-col gap-1">
        {items.map((s) => (
          <li key={s.slug}>
            <Link to={`/thread/${s.threadId}`} className="text-[13.5px] text-signal hover:underline">{s.title}</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

`web/src/screens/Browse.tsx`: `const KINDS: HubKind[] = ["topic", "release", "agency", "location", "decade"];`

`web/src/components/SiteFooter.tsx`: `const GROUPS: [HubKind, string][] = [["topic", "Topics"], ["release", "Releases"], ["agency", "Agencies"], ["decade", "Decades"]];`

`web/src/screens/Doc.tsx`:

- `docFooterLinks` gains a `topics` parameter and appends `...(topics ?? []).map((t) => ({ to: `/topic/${t.slug}`, text: `More on ${t.label}` }))` before the `.filter(...)`; update its call to `docFooterLinks(record, detail.hubs, detail.release, detail.topics)`.
- After the meta grid `</div>` (the `MetaCell` grid), add:

```tsx
      {detail.topics && detail.topics.length > 0 && (
        <div className="-mt-2 mb-4 flex flex-wrap items-center gap-[7px] font-mono text-[10px]">
          <span className="text-faint">TOPICS</span>
          {detail.topics.map((t) => (
            <Link key={t.slug} to={`/topic/${t.slug}`} className="rounded-[7px] border border-line px-[9px] py-1 text-dim hover:border-signal hover:text-signal">
              {t.label}
            </Link>
          ))}
        </div>
      )}
```

(`Link` is already imported in Doc.tsx from react-router-dom; confirm.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && npx tsc --noEmit -p tsconfig.app.json && npx vitest run src/tests/hub.test.tsx src/tests/doc.test.tsx` → new tests PASS (doc.test keeps only its baseline failures). Full web suite `npx vitest run` → 19 baseline failures only.

- [ ] **Step 5: Commit**

```bash
git add web/src/api/types.ts web/src/screens/Hub.tsx web/src/screens/Browse.tsx web/src/components/SiteFooter.tsx web/src/screens/Doc.tsx web/src/tests/hub.test.tsx web/src/tests/doc.test.tsx
git commit -m "feat(topics): SPA topic hub blocks, Topics in Browse and footer, doc topic chips

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: User review gate, deploy, highlights, IndexNow

**Files:** none (operational) unless the review asks for text edits (then `worker/lib/topicText.ts` + re-run Task 2's check and tests).

- [ ] **Step 1: Local check** — `cd web && npx vite build`, restart `worker-dev` (preview_start), then confirm counts against the spec appendix:

```bash
curl -s http://localhost:8787/api/hubs | python3 -c "import json,sys;[print(h['slug'],h['count']) for h in json.load(sys.stdin)['hubs'] if h['kind']=='topic']"
curl -s http://localhost:8787/topic/aawsap | grep -oE "<h1>[^<]*|Sources in the archive|Related stories" | head
```

Expected (prod-seeded local D1): aawsap 44, mission-reports 34, flying-discs 13, apollo-nasa 20, fbi-62-hq-83894 18, project-blue-book 9, police 8, nuclear-sites 8–9, aaro-case-resolutions 7, congress 55. Screenshot `/topic/aawsap` and one doc page with topic chips in the browser pane.

- [ ] **Step 2: STOP — user review.** Show the user all 10 `background` / `lore` / `sources` texts (from `worker/lib/topicText.ts`) and wait for approval. Apply requested edits (re-run `python3 scripts/check_topic_sources.py` and the topics tests after edits, commit).

- [ ] **Step 3: Deploy from a clean worktree of HEAD** (the migration applies as part of `pnpm run deploy`):

```bash
npx wrangler d1 migrations list realufo-db --remote | tail -3   # expect 0031_hub_highlights_topic pending (and nothing unexpected)
export PATH="/Users/laichan/.nvm/versions/node/v22.22.0/bin:$PATH"
D=<scratchpad>/deploy-topics; git worktree add --detach $D HEAD && cd $D
pnpm install --frozen-lockfile --prefer-offline && (cd web && pnpm install --frozen-lockfile --prefer-offline)
pnpm run deploy
```

Expected: migration applied, `Current Version ID: …`.

- [ ] **Step 4: Verify live, push, clean up**

```bash
curl -s https://realufo.org/api/hubs | python3 -c "import json,sys;print([h['slug'] for h in json.load(sys.stdin)['hubs'] if h['kind']=='topic'])"
curl -s https://realufo.org/topic/aawsap | grep -c "Sources in the archive"   # 1
curl -s https://realufo.org/sitemap.xml | grep -c "/topic/"                    # 10
git push origin <deployed sha>:build/app-foundation
git worktree remove --force $D
```

- [ ] **Step 5: Highlights for topics**

```bash
cd crawler && python3 -m ingest.highlights --only topic/aawsap topic/mission-reports topic/flying-discs topic/apollo-nasa topic/fbi-62-hq-83894 topic/project-blue-book topic/police topic/nuclear-sites topic/aaro-case-resolutions topic/congress
```

Expected: one highlight row per topic written (skips any with < 2 valid picks).

- [ ] **Step 6: IndexNow** — all topic pages plus the member doc pages (their Topics row changed):

```bash
python3 - <<'EOF' > /tmp/topic_urls.txt
import json, urllib.request
hubs = json.load(urllib.request.urlopen("https://realufo.org/api/hubs"))["hubs"]
urls = ["https://realufo.org/browse"]
for h in hubs:
    if h["kind"] != "topic": continue
    urls.append(f"https://realufo.org/topic/{h['slug']}")
    hub = json.load(urllib.request.urlopen(f"https://realufo.org/api/hubs/topic/{h['slug']}"))
    urls += [f"https://realufo.org/doc/{r['id']}" for r in hub["records"]]
print("\n".join(dict.fromkeys(urls)))
EOF
python3 crawler/indexnow.py $(cat /tmp/topic_urls.txt)
```

Expected: `200 submitted N urls`.

- [ ] **Step 7: Record** — append to project memory (`realufo-project-state.md`): live version + commit, and the follow-up: **after the PaddleOCR re-OCR lands, rerun the membership audit and consider a `fulltext` rule field (FTS `MATCH` over `record_fts`) for topics whose files are missed by title/summary rules.**
