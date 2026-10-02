# Hub Landing Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Indexable hub pages for every release, agency, location and decade with ≥ 5 files, plus `/browse`, linked from doc pages, the Archive and the sitemap.

**Architecture:** A pure registry (`worker/lib/hubs.ts`) maps hub slugs to raw D1 values and writes titles/intros from data. `worker/routes/hubs.ts` loads hubs from D1 (hub list memoised 1h in the Cache API), serves `/api/hubs*`, feeds the Worker pre-render and adds `hubs` links to the doc detail. The SPA gets `Hub` and `Browse` screens and links doc facts to hubs.

**Tech Stack:** Cloudflare Workers + D1 + Cache API, vitest-pool-workers; React + react-router + react-query, vitest + testing-library.

**Spec:** `docs/superpowers/specs/2026-10-02-realufo-hub-pages-design.md`

## Global Constraints

- `MIN_HUB_FILES = 5`: a hub below it does not exist anywhere (API 404, pre-render plain shell, not in `/api/hubs`, sitemap, `/browse`, or doc links).
- URLs: `/release/<no>`, `/agency/<slug>`, `/location/<slug>`, `/decade/<YYYY>s`, `/browse`. API: `GET /api/hubs`, `GET /api/hubs/:kind/:slug` (`cache-control: public, max-age=300`).
- Agency/location slugs, labels and raw values exactly as the spec's tables. Each registry entry also carries a `phrase` used in the intro ("from the Federal Bureau of Investigation (FBI)", "about incidents in Las Vegas, Nevada") — this replaces the spec's `full` column (same meaning, sentence-ready). Titles use `label`.
- Titles: release `Release 06 · 18 Sep 2026`; agency `FBI UAP files`; location `UAP files: Las Vegas, Nevada`; decade `1950s UAP files`.
- Intro: `<n> declassified UAP file(s) <phrase>: <parts>.` + `Incidents span A–B.` / `Incidents date from A.` / nothing. Release phrase: `the Department of War published on 18 September 2026 (Release 06)`; decade phrase: `about incidents in the 1950s`. Parts omit zeros: `40 PDFs, 30 videos, 1 image`.
- Hub file lists: `r.status='live'`, `ORDER BY r.featured DESC, r.created_at DESC, r.id`, same card columns as `/api/records`.
- The D1 data is never modified.
- Other chats share `build/app-foundation`: work in a worktree, stage only files a task names.
- Worker tests: `npx vitest run --config worker/vitest.config.ts` + `npx tsc --noEmit` (repo root). Web: `PATH=$HOME/.nvm/versions/node/v22.22.0/bin:$PATH pnpm -C web test` and `pnpm -C web build` (runs `tsc -b`).

## Review Focus

1. A record whose agency/location is an alias (`Department of War`, `Westen United States`, `Colorado Springs, Colorado, U.S.`) → links to the merged hub, and the hub lists it. Tests in Tasks 2 and 3.
2. A hub that drops below 5 files (or a decade with 2 files, e.g. 1980s) → no page, no link from doc pages, not in sitemap/browse. Tests in Tasks 3 and 4.
3. Unknown kind (`/api/hubs/planet/mars`) or garbage slug (`/decade/abc`, `/release/99`) → 404 / plain shell, never a 500. Tests in Tasks 3 and 4.
4. Hub label/intro text with `&`/`<` (e.g. `Washington, D.C.`, future labels) → escaped in pre-render. Test in Task 4.
5. `/api/records/:id` keeps working when the hub list cache is cold or D1 facet queries throw → doc still renders without hub links. Test in Task 3.

---

### Task 1: Shared helpers — `lib/facets.ts`, `lib/cache.ts`, `CARD_COLS`

**Files:**
- Create: `worker/lib/facets.ts`, `worker/lib/cache.ts`
- Modify: `worker/routes/records.ts` (move helpers out, use `CARD_COLS`, `recordFacets` via `facetCounts`), `worker/lib/db.ts` (add `CARD_COLS`), `worker/lib/meta.ts` (`cachedPage` via `cachedJson`)
- Test: `worker/tests/cache.spec.ts` (new); existing suite guards the moves

**Interfaces:**
- Produces:
  - `worker/lib/facets.ts`: `isoDate(mdy: string): string | null`, `yearOf(d: string | null): string | null`, `decadeOf(d: string | null): number | null`, `wargovReleases(env: Env): Promise<{ no: number; date: string; raw: string[]; count: number }[]>`, `facetCounts(env: Env): Promise<{ releases: <wargovReleases result>; agencies: {name:string;count:number}[]; locations: {name:string;count:number}[]; decades: {decade:number;count:number}[] }>`
  - `worker/lib/cache.ts`: `cachedJson<T>(key: string, load: () => Promise<T | null>, ttl?: number): Promise<T | null>`
  - `worker/lib/db.ts`: `CARD_COLS: string`

- [ ] **Step 1: Write the failing test** — `worker/tests/cache.spec.ts`

```ts
import { describe, it, expect } from "vitest";
import { cachedJson } from "../lib/cache";

describe("cachedJson", () => {
  it("memoises a value per key", async () => {
    let calls = 0;
    const load = async () => ({ n: ++calls });
    expect(await cachedJson("https://x/__t/a", load)).toEqual({ n: 1 });
    expect(await cachedJson("https://x/__t/a", load)).toEqual({ n: 1 });
    expect(calls).toBe(1);
  });
  it("never stores null", async () => {
    let calls = 0;
    const none = async () => (calls++, null);
    expect(await cachedJson("https://x/__t/b", none)).toBeNull();
    await cachedJson("https://x/__t/b", none);
    expect(calls).toBe(2);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run --config worker/vitest.config.ts worker/tests/cache.spec.ts`
Expected: FAIL — cannot resolve `../lib/cache`.

- [ ] **Step 3: Create `worker/lib/cache.ts`**

```ts
// Workers Cache API JSON memo: `load()` runs at most once per key per colo per
// `ttl` seconds. null results are not stored (misses stay cheap to retry).
// Keys are absolute URLs on the serving origin, e.g. `${origin}/__page/doc/X`.
export async function cachedJson<T>(key: string, load: () => Promise<T | null>, ttl = 3600): Promise<T | null> {
  const req = new Request(key);
  const hit = await caches.default.match(req);
  if (hit) return hit.json<T>();
  const value = await load();
  if (value != null)
    await caches.default.put(
      req,
      new Response(JSON.stringify(value), {
        headers: { "content-type": "application/json", "cache-control": `max-age=${ttl}` },
      })
    );
  return value;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run --config worker/vitest.config.ts worker/tests/cache.spec.ts` → 2 passed.

- [ ] **Step 5: Create `worker/lib/facets.ts`** — MOVE (cut from `worker/routes/records.ts`, keep bodies byte-identical) `isoDate`, `wargovReleases`, `yearOf`, `decadeOf` with their comments, export all four, and add `facetCounts` built from the body of `recordFacets`:

```ts
import type { Env } from "../env";

// <isoDate, wargovReleases, yearOf, decadeOf moved here verbatim from routes/records.ts, each `export`ed>

// Grouped counts behind the Archive filters (GET /api/records/facets) and the
// hub registry (routes/hubs.ts listHubs).
export async function facetCounts(env: Env) {
  const groupBy = (col: string) =>
    env.DB.prepare(
      `SELECT ${col} name, count(*) count FROM records WHERE ${col} IS NOT NULL AND trim(${col}) NOT IN ('','N/A')
       GROUP BY ${col} ORDER BY count DESC, name`
    ).all<{ name: string; count: number }>();
  const [releases, agencies, locations, dates] = await Promise.all([
    wargovReleases(env),
    groupBy("agency"),
    groupBy("location"),
    env.DB.prepare("SELECT incident_date d, count(*) n FROM records GROUP BY incident_date").all<{ d: string | null; n: number }>(),
  ]);
  const decades = new Map<number, number>();
  for (const r of dates.results) {
    const dec = decadeOf(r.d);
    if (dec) decades.set(dec, (decades.get(dec) ?? 0) + r.n);
  }
  return {
    releases,
    agencies: agencies.results,
    locations: locations.results,
    decades: [...decades].sort(([a], [b]) => a - b).map(([decade, count]) => ({ decade, count })),
  };
}
```

- [ ] **Step 6: Rewire `worker/routes/records.ts`**
  - Add `import { isoDate, yearOf, decadeOf, wargovReleases, facetCounts } from "../lib/facets";` and `CARD_COLS` to the `../lib/db` import (drop `thumbSql`/`durationSql` imports if now unused).
  - Delete the moved function definitions.
  - Replace `recordFacets` with:

```ts
// Archive filter options with global counts (not narrowed by other filters).
export async function recordFacets(_req: Request, env: Env) {
  const f = await facetCounts(env);
  return json({
    releases: f.releases.map(({ no, date, count }) => ({ no, date, count })),
    agencies: f.agencies,
    decades: f.decades,
    locations: f.locations,
  });
}
```

  - In `listRecords` and `relatedOf`, replace the select list `r.id,r.archive,r.agency,r.title,r.summary,r.kind,r.redacted,r.location,r.incident_date,r.doc_date, ${thumbSql("r.id")} thumb, ${durationSql("r.id")} duration` (whitespace differs between the two) with `${CARD_COLS}`.

  `worker/lib/db.ts` — append:

```ts
// List-card columns (/api/records, related groups, hubs) for `records r`.
export const CARD_COLS = `r.id,r.archive,r.agency,r.title,r.summary,r.kind,r.redacted,r.location,r.incident_date,r.doc_date,
  ${thumbSql("r.id")} thumb, ${durationSql("r.id")} duration`;
```

  `worker/lib/meta.ts` — import `cachedJson` from `./cache` and replace the body of `cachedPage` (keep its comment block):

```ts
async function cachedPage(url: URL, load: () => Promise<Page | null>): Promise<Page | null> {
  return cachedJson(`${url.origin}/__page${url.pathname}`, load, PAGE_TTL);
}
```

- [ ] **Step 7: Run the whole worker suite + typecheck**

Run: `npx vitest run --config worker/vitest.config.ts` and `npx tsc --noEmit`
Expected: all previously passing tests still pass + 2 new; tsc clean. `grep -n "function decadeOf\|function yearOf\|function wargovReleases\|function isoDate" worker/routes/records.ts` → no output.

- [ ] **Step 8: Commit**

```bash
git add worker/lib/facets.ts worker/lib/cache.ts worker/lib/db.ts worker/lib/meta.ts worker/routes/records.ts worker/tests/cache.spec.ts
git commit -m "refactor(worker): facets + cache helpers and CARD_COLS shared for hub pages"
```

---

### Task 2: Pure hub registry — `worker/lib/hubs.ts`

**Files:**
- Create: `worker/lib/hubs.ts`
- Test: `worker/tests/hubs-lib.spec.ts`

**Interfaces:**
- Consumes: `yearOf`, `decadeOf` from `./facets` (Task 1).
- Produces (all exported):
  - `type HubKind = "release" | "agency" | "location" | "decade"`, `HUB_KINDS: HubKind[]` (that order)
  - `MIN_HUB_FILES = 5`
  - `interface HubSummary { kind: HubKind; slug: string; label: string; count: number }`
  - `interface HubStats { files: number; pdf: number; video: number; image: number; from: string | null; to: string | null }`
  - `type HubLinks = Partial<Record<HubKind, string>>`
  - `AGENCY_HUBS`, `LOCATION_HUBS`: `{ slug: string; label: string; phrase: string; values: string[] }[]`
  - `releaseLabel(no: number, isoDate: string): string` → `"Release 06 · 18 Sep 2026"`
  - `hubTitle(h: HubSummary): string`
  - `hubStats(records: { kind: string; incident_date: string | null }[]): HubStats`
  - `hubIntro(h: HubSummary, release: { no: number; date: string } | null, s: HubStats): string`
  - `hubsFor(r: { agency: string | null; location: string | null; incident_date: string | null }, releaseNo: number | null, live: Set<string>): HubLinks` (live keys `"<kind>/<slug>"`)

- [ ] **Step 1: Write the failing tests** — `worker/tests/hubs-lib.spec.ts`

```ts
import { describe, it, expect } from "vitest";
import { AGENCY_HUBS, LOCATION_HUBS, hubIntro, hubStats, hubTitle, hubsFor, releaseLabel } from "../lib/hubs";

describe("hub registry", () => {
  it("slugs are url-safe and unique; no raw value sits in two hubs of a kind", () => {
    for (const hubs of [AGENCY_HUBS, LOCATION_HUBS]) {
      expect(new Set(hubs.map((h) => h.slug)).size).toBe(hubs.length);
      expect(hubs.every((h) => /^[a-z0-9-]+$/.test(h.slug))).toBe(true);
      const vals = hubs.flatMap((h) => h.values);
      expect(new Set(vals).size).toBe(vals.length);
    }
    expect(AGENCY_HUBS.length).toBe(9);
    expect(LOCATION_HUBS.length).toBe(19);
  });

  it("hubsFor maps aliases and only links live hubs", () => {
    const live = new Set(["agency/department-of-war", "location/colorado", "location/western-united-states", "release/2", "decade/1940s"]);
    expect(hubsFor({ agency: "Department of War", location: "Colorado Springs, Colorado, U.S.", incident_date: "12/30/47" }, 2, live)).toEqual({
      agency: "department-of-war", location: "colorado", release: "2", decade: "1940s",
    });
    expect(hubsFor({ agency: "DoW", location: "Westen United States", incident_date: null }, null, live)).toEqual({
      agency: "department-of-war", location: "western-united-states",
    });
    expect(hubsFor({ agency: "FBI", location: "Atlantis", incident_date: "1985" }, 3, live)).toEqual({});
  });
});

describe("titles, stats, intros", () => {
  it("titles per kind", () => {
    expect(releaseLabel(6, "2026-09-18")).toBe("Release 06 · 18 Sep 2026");
    expect(hubTitle({ kind: "release", slug: "6", label: "Release 06 · 18 Sep 2026", count: 74 })).toBe("Release 06 · 18 Sep 2026");
    expect(hubTitle({ kind: "agency", slug: "fbi", label: "FBI", count: 5 })).toBe("FBI UAP files");
    expect(hubTitle({ kind: "location", slug: "las-vegas-nevada", label: "Las Vegas, Nevada", count: 37 })).toBe("UAP files: Las Vegas, Nevada");
    expect(hubTitle({ kind: "decade", slug: "1950s", label: "1950s", count: 29 })).toBe("1950s UAP files");
  });

  it("stats count kinds and year range", () => {
    expect(hubStats([
      { kind: "pdf", incident_date: "1952" }, { kind: "pdf", incident_date: "July, 1952" }, { kind: "image", incident_date: null },
    ])).toEqual({ files: 3, pdf: 2, video: 0, image: 1, from: "1952", to: "1952" });
  });

  it("intro pluralises, omits zero parts and phrases years", () => {
    const one = { files: 3, pdf: 2, video: 0, image: 1, from: "1952", to: "1952" };
    expect(hubIntro({ kind: "decade", slug: "1950s", label: "1950s", count: 3 }, null, one)).toBe(
      "3 declassified UAP files about incidents in the 1950s: 2 PDFs, 1 image. Incidents date from 1952."
    );
    const span = { files: 1, pdf: 0, video: 1, image: 0, from: "1947", to: "2025" };
    expect(hubIntro({ kind: "release", slug: "6", label: "Release 06 · 18 Sep 2026", count: 1 }, { no: 6, date: "2026-09-18" }, span)).toBe(
      "1 declassified UAP file the Department of War published on 18 September 2026 (Release 06): 1 video. Incidents span 1947–2025."
    );
    const noYear = { files: 2, pdf: 0, video: 2, image: 0, from: null, to: null };
    expect(hubIntro({ kind: "agency", slug: "fbi", label: "FBI", count: 2 }, null, noYear)).toBe(
      "2 declassified UAP files from the Federal Bureau of Investigation (FBI): 2 videos."
    );
    expect(hubIntro({ kind: "location", slug: "las-vegas-nevada", label: "Las Vegas, Nevada", count: 2 }, null, noYear)).toBe(
      "2 declassified UAP files about incidents in Las Vegas, Nevada: 2 videos."
    );
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run --config worker/vitest.config.ts worker/tests/hubs-lib.spec.ts`
Expected: FAIL — cannot resolve `../lib/hubs`.

- [ ] **Step 3: Implement** — `worker/lib/hubs.ts`

```ts
// Hub landing pages (spec 2026-10-02-realufo-hub-pages): which raw D1 values
// each hub covers, and the titles/intros written from a hub's own data. Pure —
// D1 access lives in routes/hubs.ts. D1 values are never rewritten; aliases
// merge duplicates and typos ("DoW" + "Department of War").
import { decadeOf, yearOf } from "./facets";

export type HubKind = "release" | "agency" | "location" | "decade";
export const HUB_KINDS: HubKind[] = ["release", "agency", "location", "decade"];
export const MIN_HUB_FILES = 5;

export interface HubSummary { kind: HubKind; slug: string; label: string; count: number }
export interface HubStats { files: number; pdf: number; video: number; image: number; from: string | null; to: string | null }
export type HubLinks = Partial<Record<HubKind, string>>;
type Entry = { slug: string; label: string; phrase: string; values: string[] };

export const AGENCY_HUBS: Entry[] = [
  { slug: "department-of-war", label: "Department of War", phrase: "from the U.S. Department of War (the Pentagon)", values: ["DoW", "Department of War"] },
  { slug: "fbi", label: "FBI", phrase: "from the Federal Bureau of Investigation (FBI)", values: ["FBI"] },
  { slug: "aaro", label: "AARO", phrase: "from the All-domain Anomaly Resolution Office (AARO)", values: ["AARO"] },
  { slug: "nara", label: "National Archives", phrase: "held by the U.S. National Archives (NARA)", values: ["NARA"] },
  { slug: "nasa", label: "NASA", phrase: "from NASA", values: ["NASA"] },
  { slug: "cia", label: "CIA", phrase: "from the Central Intelligence Agency (CIA)", values: ["CIA", "Central Intelligence Agency"] },
  { slug: "department-of-state", label: "Department of State", phrase: "from the U.S. Department of State", values: ["Department of State", "DoS"] },
  { slug: "department-of-energy", label: "Department of Energy", phrase: "from the U.S. Department of Energy", values: ["Department of Energy"] },
  { slug: "local-law-enforcement", label: "Local law enforcement", phrase: "from local law enforcement agencies", values: ["Local Law Enforcement"] },
];

export const LOCATION_HUBS: Entry[] = [
  { slug: "western-united-states", label: "Western United States", phrase: "about incidents in the western United States", values: ["Western United States", "Westen United States"] },
  { slug: "las-vegas-nevada", label: "Las Vegas, Nevada", phrase: "about incidents in Las Vegas, Nevada", values: ["Las Vegas, Nevada"] },
  { slug: "centcom", label: "CENTCOM (Middle East)", phrase: "about incidents in U.S. Central Command's area (CENTCOM)", values: ["CENTCOM"] },
  { slug: "middle-east", label: "Middle East", phrase: "about incidents in the Middle East", values: ["Middle East"] },
  { slug: "europe", label: "Europe", phrase: "about incidents in Europe", values: ["Europe"] },
  { slug: "iraq", label: "Iraq", phrase: "about incidents in Iraq", values: ["Iraq"] },
  { slug: "syria", label: "Syria", phrase: "about incidents in Syria", values: ["Syria"] },
  { slug: "arabian-gulf", label: "Arabian Gulf", phrase: "about incidents over the Arabian Gulf", values: ["Arabian Gulf"] },
  { slug: "northeastern-united-states", label: "Northeastern United States", phrase: "about incidents in the northeastern United States", values: ["Northeastern United States"] },
  { slug: "colorado", label: "Colorado", phrase: "about incidents in Colorado", values: ["Colorado", "Colorado Springs, Colorado", "Colorado Springs, Colorado, U.S."] },
  { slug: "eastern-united-states", label: "Eastern United States", phrase: "about incidents in the eastern United States", values: ["Eastern United States"] },
  { slug: "moon", label: "The Moon", phrase: "about sightings on or around the Moon", values: ["Moon"] },
  { slug: "yellow-sea", label: "Yellow Sea", phrase: "about incidents over the Yellow Sea", values: ["Yellow Sea"] },
  { slug: "washington-dc", label: "Washington, D.C.", phrase: "about incidents in Washington, D.C.", values: ["Washington, D.C."] },
  { slug: "east-china-sea", label: "East China Sea", phrase: "about incidents over the East China Sea", values: ["East China Sea"] },
  { slug: "pacific-ocean", label: "Pacific Ocean", phrase: "about incidents over the Pacific Ocean", values: ["Pacific Ocean"] },
  { slug: "greece", label: "Greece", phrase: "about incidents in Greece", values: ["Greece"] },
  { slug: "low-earth-orbit", label: "Low Earth orbit", phrase: "about sightings in low Earth orbit", values: ["Low Earth Orbit", "Low-Earth Orbit"] },
  { slug: "atlantic-ocean", label: "Atlantic Ocean", phrase: "about incidents over the Atlantic Ocean", values: ["Atlantic Ocean", "North Atlantic Ocean"] },
];

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const pad2 = (n: number) => String(n).padStart(2, "0");
// "2026-09-18" → [18, 8 (month index), 2026]
const ymd = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return [d, m - 1, y] as const;
};
const longDate = (iso: string) => {
  const [d, m, y] = ymd(iso);
  return `${d} ${MONTHS[m]} ${y}`;
};

export function releaseLabel(no: number, iso: string): string {
  const [d, m, y] = ymd(iso);
  return `Release ${pad2(no)} · ${d} ${MONTHS[m].slice(0, 3)} ${y}`;
}

export function hubTitle(h: HubSummary): string {
  if (h.kind === "release") return h.label;
  if (h.kind === "location") return `UAP files: ${h.label}`;
  return `${h.label} UAP files`;
}

export function hubStats(records: { kind: string; incident_date: string | null }[]): HubStats {
  const years = records.map((r) => yearOf(r.incident_date)).filter((y): y is string => !!y).sort();
  const n = (k: string) => records.filter((r) => r.kind === k).length;
  return {
    files: records.length, pdf: n("pdf"), video: n("video"), image: n("image"),
    from: years[0] ?? null, to: years[years.length - 1] ?? null,
  };
}

const entry = (kind: HubKind, slug: string) =>
  (kind === "agency" ? AGENCY_HUBS : kind === "location" ? LOCATION_HUBS : []).find((e) => e.slug === slug);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function hubIntro(h: HubSummary, release: { no: number; date: string } | null, s: HubStats): string {
  const phrase =
    h.kind === "release" && release
      ? `the Department of War published on ${longDate(release.date)} (Release ${pad2(release.no)})`
      : h.kind === "decade"
        ? `about incidents in the ${h.slug}`
        : entry(h.kind, h.slug)?.phrase ?? `about ${h.label}`;
  const parts = [plural(s.pdf, "PDF"), plural(s.video, "video"), plural(s.image, "image")].filter((p) => !p.startsWith("0 "));
  const years = !s.from || !s.to ? "" : s.from === s.to ? ` Incidents date from ${s.from}.` : ` Incidents span ${s.from}–${s.to}.`;
  return `${plural(s.files, "declassified UAP file")} ${phrase}: ${parts.join(", ")}.${years}`;
}

export function hubsFor(
  r: { agency: string | null; location: string | null; incident_date: string | null },
  releaseNo: number | null,
  live: Set<string>
): HubLinks {
  const out: HubLinks = {};
  const add = (kind: HubKind, slug: string | undefined) => {
    if (slug && live.has(`${kind}/${slug}`)) out[kind] = slug;
  };
  add("agency", AGENCY_HUBS.find((e) => e.values.includes(r.agency ?? ""))?.slug);
  add("location", LOCATION_HUBS.find((e) => e.values.includes(r.location ?? ""))?.slug);
  add("release", releaseNo ? String(releaseNo) : undefined);
  const dec = decadeOf(r.incident_date);
  add("decade", dec ? `${dec}s` : undefined);
  return out;
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run --config worker/vitest.config.ts worker/tests/hubs-lib.spec.ts` → 5 passed. Then `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add worker/lib/hubs.ts worker/tests/hubs-lib.spec.ts
git commit -m "feat(hubs): pure hub registry — aliases, titles, data-written intros, doc→hub links"
```

---

### Task 3: Hub loading + API + doc `hubs` links — `worker/routes/hubs.ts`

**Files:**
- Create: `worker/routes/hubs.ts`
- Modify: `worker/index.ts` (register 2 routes), `worker/routes/records.ts` (`loadRecord(env, id, origin)` + `hubs`; `getRecord` passes origin), `worker/lib/pages.ts` (`docPage` passes `url.origin`)
- Test: `worker/tests/hubs.spec.ts` (new), `worker/tests/records.spec.ts` (call-site update)

**Interfaces:**
- Consumes: Task 1 `facetCounts`, `wargovReleases`, `decadeOf`, `cachedJson`, `CARD_COLS`; Task 2 everything.
- Produces:
  - `listHubs(env: Env): Promise<HubSummary[]>` (uncached, ≥ MIN only, order: releases by no, agencies/locations registry order, decades ascending)
  - `listHubsCached(env: Env, origin: string): Promise<HubSummary[]>` (1h, key `${origin}/__hubs`)
  - `interface Hub { kind: HubKind; slug: string; title: string; intro: string; stats: HubStats; records: CardRow[]; siblings: HubSummary[]; prev?: string | null; next?: string | null }` with `CardRow = { id: string; title: string; kind: string; incident_date: string | null } & Record<string, unknown>`
  - `loadHub(env: Env, kind: string, slug: string, origin: string): Promise<Hub | null>`
  - Route handlers `hubsIndex(req, env)`, `getHub(req, env, p)`
  - `loadRecord(env, id, origin)` result gains `hubs: HubLinks`

- [ ] **Step 1: Write the failing tests** — `worker/tests/hubs.spec.ts`

Seed facts (realufo-handoff/data.js, 28 records): FBI 5 (FBI-UAP-D002/D003/D009/D010/D011), DoW 10, AARO 8, CIA 1, NASA 1, DoS 2; wargov doc_date `5/8/26` 12 files (Release 01), `6/12/26` 8 files (Release 02); `Colorado Springs, Colorado, U.S.` 3; decades 1940s 5, 2020s 5, 1950s 3.

```ts
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../index";
import { seedTestDB } from "./helpers";
import { loadRecord } from "../routes/records";

beforeAll(() => seedTestDB(env.DB));
const SHELL = '<html><head><!--META--></head><body><div id="root"></div></body></html>';
const call = async (path: string, over: Record<string, unknown> = {}) => {
  const ctx = createExecutionContext();
  const res = await worker.fetch(
    new Request("https://x" + path),
    { ...env, ASSETS: { fetch: async () => new Response(SHELL) }, ...over } as any,
    ctx
  );
  await waitOnExecutionContext(ctx);
  return res;
};

describe("hub API", () => {
  it("lists only hubs at or above the threshold", async () => {
    const { hubs } = (await (await call("/api/hubs")).json()) as any;
    const keys = hubs.map((h: any) => `${h.kind}/${h.slug}`);
    expect(keys).toEqual(expect.arrayContaining([
      "release/1", "release/2", "agency/department-of-war", "agency/fbi", "agency/aaro", "decade/1940s", "decade/2020s",
    ]));
    for (const k of ["agency/cia", "agency/nasa", "agency/department-of-state", "location/colorado", "decade/1950s"])
      expect(keys).not.toContain(k);
    expect(keys.indexOf("release/1")).toBeLessThan(keys.indexOf("agency/department-of-war"));
  });

  it("agency hub lists all its files with stats, intro and siblings", async () => {
    const res = await call("/api/hubs/agency/fbi");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=300");
    const h: any = await res.json();
    expect(h.title).toBe("FBI UAP files");
    expect(h.records.map((r: any) => r.id).sort()).toEqual(["FBI-UAP-D002", "FBI-UAP-D003", "FBI-UAP-D009", "FBI-UAP-D010", "FBI-UAP-D011"]);
    expect(h.records[0]).toHaveProperty("thumb");
    expect(h.stats.files).toBe(5);
    expect(h.intro).toMatch(/^5 declassified UAP files from the Federal Bureau of Investigation \(FBI\): /);
    const sib = h.siblings.map((s: any) => s.slug);
    expect(sib).toContain("department-of-war");
    expect(sib).not.toContain("fbi");
    expect(h).not.toHaveProperty("prev");
  });

  it("alias values land in the merged hub", async () => {
    await env.DB.prepare(
      "INSERT INTO records(id,archive,agency,title,kind,status) VALUES('ALIAS-1','wargov','Department of War','ALIAS-1, alias test','pdf','live')"
    ).run();
    const h: any = await (await call("/api/hubs/agency/department-of-war")).json();
    expect(h.records.map((r: any) => r.id)).toContain("ALIAS-1");
  });

  it("release hub: title, prev/next, its files", async () => {
    const h: any = await (await call("/api/hubs/release/2")).json();
    expect(h.title).toBe("Release 02 · 12 Jun 2026");
    expect(h.prev).toBe("1");
    expect(h.next).toBeNull();
    expect(h.records.length).toBe(8);
  });

  it("below-threshold, unknown slug and unknown kind are 404s", async () => {
    for (const p of ["/api/hubs/agency/cia", "/api/hubs/agency/nope", "/api/hubs/planet/mars", "/api/hubs/decade/1950s", "/api/hubs/decade/abc", "/api/hubs/release/99"])
      expect((await call(p)).status, p).toBe(404);
  });

  it("doc detail carries links to its live hubs", async () => {
    const d: any = await (await call("/api/records/FBI-UAP-D002")).json();
    expect(d.hubs).toEqual({ agency: "fbi", release: "2", decade: "2020s" });
  });

  it("doc detail still loads when hub listing fails", async () => {
    const DB = new Proxy(env.DB, {
      get(t: any, k) {
        if (k === "prepare")
          return (sql: string) => {
            if (/GROUP BY/.test(sql)) throw new Error("D1 overloaded");
            return t.prepare(sql);
          };
        const v = t[k];
        return typeof v === "function" ? v.bind(t) : v;
      },
    });
    const d: any = await loadRecord({ ...env, DB } as any, "FBI-UAP-D003", "https://cold-cache.example");
    expect(d.record.id).toBe("FBI-UAP-D003");
    expect(d.hubs).toEqual({});
  });
});
```

Update every `loadRecord(env as any, "<id>")` call in `worker/tests/records.spec.ts` to `loadRecord(env as any, "<id>", "https://x")`:

```bash
sed -i '' -E 's/loadRecord\(env as any, ("[^"]*")\)/loadRecord(env as any, \1, "https:\/\/x")/g' worker/tests/records.spec.ts
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run --config worker/vitest.config.ts worker/tests/hubs.spec.ts`
Expected: FAIL — `/api/hubs` 404 (`res.json()` lacks `hubs`), `d.hubs` undefined.

- [ ] **Step 3: Implement** — `worker/routes/hubs.ts`

```ts
import type { Env } from "../env";
import { json, error } from "../lib/json";
import { CARD_COLS } from "../lib/db";
import { cachedJson } from "../lib/cache";
import { decadeOf, facetCounts, wargovReleases } from "../lib/facets";
import {
  AGENCY_HUBS, LOCATION_HUBS, MIN_HUB_FILES, hubIntro, hubStats, hubTitle, releaseLabel,
  type HubKind, type HubStats, type HubSummary,
} from "../lib/hubs";

export type CardRow = { id: string; title: string; kind: string; incident_date: string | null } & Record<string, unknown>;
export interface Hub {
  kind: HubKind; slug: string; title: string; intro: string; stats: HubStats;
  records: CardRow[]; siblings: HubSummary[]; prev?: string | null; next?: string | null;
}

// Every hub with ≥ MIN_HUB_FILES files, from the Archive's grouped counts.
export async function listHubs(env: Env): Promise<HubSummary[]> {
  const f = await facetCounts(env);
  const sum = (values: string[], rows: { name: string; count: number }[]) =>
    rows.filter((r) => values.includes(r.name)).reduce((n, r) => n + r.count, 0);
  return [
    ...f.releases.map((r) => ({ kind: "release" as const, slug: String(r.no), label: releaseLabel(r.no, r.date), count: r.count })),
    ...AGENCY_HUBS.map((h) => ({ kind: "agency" as const, slug: h.slug, label: h.label, count: sum(h.values, f.agencies) })),
    ...LOCATION_HUBS.map((h) => ({ kind: "location" as const, slug: h.slug, label: h.label, count: sum(h.values, f.locations) })),
    ...f.decades.map((d) => ({ kind: "decade" as const, slug: `${d.decade}s`, label: `${d.decade}s`, count: d.count })),
  ].filter((h) => h.count >= MIN_HUB_FILES);
}

// ponytail: 1h per colo; a new release/hub shows up within the hour.
export const listHubsCached = async (env: Env, origin: string) =>
  (await cachedJson(`${origin}/__hubs`, () => listHubs(env))) ?? [];

// SQL filter selecting one hub's records (table alias r).
async function hubFilter(env: Env, h: HubSummary) {
  if (h.kind === "release") {
    const rel = (await wargovReleases(env)).find((r) => String(r.no) === h.slug);
    if (!rel) return null;
    return { where: "r.archive='wargov' AND r.doc_date IN (SELECT value FROM json_each(?))", bind: [JSON.stringify(rel.raw)], release: { no: rel.no, date: rel.date } };
  }
  if (h.kind === "decade") {
    const dec = Number(h.slug.slice(0, 4));
    const rows = await env.DB.prepare("SELECT DISTINCT incident_date d FROM records WHERE incident_date IS NOT NULL").all<{ d: string }>();
    // ponytail: decade matched in JS over distinct dates; add a stored decade column past ~20k records.
    const dates = rows.results.map((r) => r.d).filter((d) => decadeOf(d) === dec);
    return { where: "r.incident_date IN (SELECT value FROM json_each(?))", bind: [JSON.stringify(dates)], release: null };
  }
  const reg = (h.kind === "agency" ? AGENCY_HUBS : LOCATION_HUBS).find((e) => e.slug === h.slug);
  if (!reg) return null;
  return { where: `r.${h.kind} IN (SELECT value FROM json_each(?))`, bind: [JSON.stringify(reg.values)], release: null };
}

export async function loadHub(env: Env, kind: string, slug: string, origin: string): Promise<Hub | null> {
  const hubs = await listHubsCached(env, origin);
  const me = hubs.find((h) => h.kind === kind && h.slug === slug);
  if (!me) return null;
  const sel = await hubFilter(env, me);
  if (!sel) return null;
  const { results: records } = await env.DB.prepare(
    `SELECT ${CARD_COLS} FROM records r WHERE ${sel.where} AND r.status='live'
     ORDER BY r.featured DESC, r.created_at DESC, r.id`
  )
    .bind(...sel.bind)
    .all<CardRow>();
  if (records.length < MIN_HUB_FILES) return null;
  const stats = hubStats(records);
  const same = hubs.filter((h) => h.kind === me.kind);
  const i = same.indexOf(me);
  return {
    kind: me.kind, slug: me.slug, title: hubTitle(me), intro: hubIntro(me, sel.release, stats), stats, records,
    siblings: same.filter((h) => h !== me),
    ...(me.kind === "release" ? { prev: same[i - 1]?.slug ?? null, next: same[i + 1]?.slug ?? null } : {}),
  };
}

const PUBLIC = { headers: { "cache-control": "public, max-age=300" } };

export async function hubsIndex(req: Request, env: Env) {
  return json({ hubs: await listHubsCached(env, new URL(req.url).origin) }, PUBLIC);
}

export async function getHub(req: Request, env: Env, p: Record<string, string>) {
  const h = await loadHub(env, p.kind, p.slug, new URL(req.url).origin);
  return h ? json(h, PUBLIC) : error(404, "hub not found");
}
```

- [ ] **Step 4: Register routes** — `worker/index.ts`: add `import { hubsIndex, getHub } from "./routes/hubs";` and, next to the other `on("GET", …)` lines:

```ts
on("GET", "/api/hubs", hubsIndex);
on("GET", "/api/hubs/:kind/:slug", getHub);
```

- [ ] **Step 5: `loadRecord` hub links** — `worker/routes/records.ts`:
  - `import { hubsFor } from "../lib/hubs";` and `import { listHubsCached } from "./hubs";`
  - Signature `export async function loadRecord(env: Env, id: string, origin: string)`.
  - Add to its `Promise.all` array (last element) and destructuring (`…, text, hubList]`):

```ts
    // Hub links are optional garnish: a failing facet query must not break the doc.
    listHubsCached(env, origin).catch((e) => {
      console.error("hub list failed", e);
      return [];
    }),
```

  - Before `return`, add `const live = new Set(hubList.map((h) => `${h.kind}/${h.slug}`));` and add `hubs: hubsFor(record, release?.no ?? null, live)` to the returned object.
  - `getRecord`: rename `_req` to `req`, call `loadRecord(env, p.id, new URL(req.url).origin)`.
  - `worker/lib/pages.ts` `docPage`: `loadRecord(env, g.id, url.origin)` (the loader already receives `url`; rename its `_url`/unused param if needed).

- [ ] **Step 6: Run the worker suite + typecheck**

Run: `npx vitest run --config worker/vitest.config.ts` and `npx tsc --noEmit`
Expected: all pass (hubs.spec 7 new); tsc clean.

- [ ] **Step 7: Commit**

```bash
git add worker/routes/hubs.ts worker/index.ts worker/routes/records.ts worker/lib/pages.ts worker/tests/hubs.spec.ts worker/tests/records.spec.ts
git commit -m "feat(hubs): /api/hubs and /api/hubs/:kind/:slug; doc detail links its live hubs"
```

---

### Task 4: Pre-render, doc fact links, sitemap, routing

**Files:**
- Modify: `worker/lib/ssr.ts` (`hubHref`, `hubBody`, `browseBody`, `DocData.hubs`, linked facts), `worker/lib/pages.ts` (hub + browse loaders, ROUTES), `worker/routes/sitemap.ts`, `wrangler.jsonc`
- Test: `worker/tests/hubs.spec.ts` (append), `worker/tests/ssr.spec.ts` (append)

**Interfaces:**
- Consumes: Task 3 `loadHub`, `listHubs`, `listHubsCached`, `Hub`; Task 2 `HubSummary`, `HubLinks`, `HUB_KINDS`.
- Produces: `hubHref(kind: string, slug: string): string`, `hubBody(h: HubPageData): string`, `browseBody(hubs: HubSummary[]): string` in `worker/lib/ssr.ts`.

- [ ] **Step 1: Write the failing tests**

Append to `worker/tests/ssr.spec.ts` (add `hubBody`, `browseBody`, `hubHref` to its import from `../lib/ssr`):

```ts
describe("hub pre-render", () => {
  const hub = {
    kind: "location" as const, title: "UAP files: Washington, D.C. & <Area>", intro: "2 declassified UAP files about incidents in Washington, D.C.: 2 PDFs.",
    records: [{ id: "A B#1", title: "First" }, { id: "X-2", title: "Second" }],
    siblings: [{ kind: "location" as const, slug: "moon", label: "The Moon", count: 8 }],
  };
  it("renders escaped title, intro, file links and sibling hubs", () => {
    const out = hubBody(hub);
    expect(out).toContain("<h1>UAP files: Washington, D.C. &amp; &lt;Area&gt;</h1>");
    expect(out).toContain("<p>2 declassified UAP files about incidents in Washington, D.C.: 2 PDFs.</p>");
    expect(out).toContain('<a href="/doc/A%20B%231">First</a>');
    expect(out).toContain('<a href="/location/moon">The Moon (8)</a>');
    expect(out).toContain('<a href="/browse">Browse</a> › Locations');
  });
  it("release hubs get prev/next links", () => {
    const out = hubBody({ ...hub, kind: "release", prev: "5", next: null });
    expect(out).toContain('<a href="/release/5">← Release 05</a>');
  });
  it("browse groups hubs by kind with counts", () => {
    const out = browseBody([
      { kind: "release", slug: "6", label: "Release 06 · 18 Sep 2026", count: 74 },
      { kind: "decade", slug: "1950s", label: "1950s", count: 29 },
    ]);
    expect(out).toContain("<h1>Browse the archive</h1>");
    expect(out).toContain('<h2>Releases</h2><ul><li><a href="/release/6">Release 06 · 18 Sep 2026 (74)</a>');
    expect(out).toContain('<a href="/decade/1950s">1950s (29)</a>');
    expect(out).not.toContain("<h2>Agencies</h2>");
  });
  it("doc facts link to hubs only when given", () => {
    const linked = docBody(doc({}, { hubs: { agency: "fbi", release: "3", decade: "2020s" } }));
    expect(linked).toContain('<dt>Agency</dt><dd><a href="/agency/fbi">Federal Bureau of Investigation</a></dd>');
    expect(linked).toContain('<dt>Released in</dt><dd><a href="/release/3">Release 03 (2026-06-12)</a></dd>');
    expect(linked).toContain('<dt>Incident date</dt><dd><a href="/decade/2020s">2022</a></dd>');
    expect(linked).toContain("<dt>Location</dt><dd>Colorado Springs</dd>");
  });
});
```

Append to `worker/tests/hubs.spec.ts`:

```ts
describe("hub pages", () => {
  it("pre-renders /agency/fbi: h1, doc links, canonical, ItemList JSON-LD", async () => {
    const html = await (await call("/agency/fbi")).text();
    expect(html).toContain("<h1>FBI UAP files</h1>");
    expect(html).toContain('<a href="/doc/FBI-UAP-D002">');
    expect(html).toContain('<link rel="canonical" href="https://x/agency/fbi">');
    expect(html).toContain('"@type":"ItemList"');
    expect(html).toContain('"url":"https://x/doc/FBI-UAP-D002"');
  });
  it("below-threshold or garbage hub URLs serve the plain shell", async () => {
    for (const p of ["/agency/cia", "/decade/abc", "/release/99", "/location/atlantis"]) {
      const res = await call(p);
      expect(res.status, p).toBe(200);
      expect(await res.text(), p).toBe(SHELL);
    }
  });
  it("pre-renders /browse", async () => {
    const html = await (await call("/browse")).text();
    expect(html).toContain("<h1>Browse the archive</h1>");
    expect(html).toContain('<a href="/release/2">Release 02 · 12 Jun 2026 (8)</a>');
    expect(html).not.toContain("/agency/cia");
  });
  it("doc pre-render links its facts to hubs", async () => {
    const html = await (await call("/doc/FBI-UAP-D002")).text();
    expect(html).toContain('<dt>Agency</dt><dd><a href="/agency/fbi">');
  });
  it("sitemap lists /browse and live hub URLs only", async () => {
    const xml = await (await call("/sitemap.xml")).text();
    expect(xml).toContain("<loc>https://x/browse</loc>");
    expect(xml).toContain("<loc>https://x/agency/fbi</loc>");
    expect(xml).toContain("<loc>https://x/release/2</loc>");
    expect(xml).toContain("<loc>https://x/decade/1940s</loc>");
    expect(xml).not.toContain("/agency/cia<");
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run --config worker/vitest.config.ts worker/tests/ssr.spec.ts worker/tests/hubs.spec.ts`
Expected: ssr: import errors / missing exports (`hubBody` not a function); hubs: `/agency/fbi` returns ASSETS passthrough shell (no `<h1>`), sitemap lacks hub URLs.

- [ ] **Step 3: `worker/lib/ssr.ts`**

Add near the other href helpers:

```ts
export const hubHref = (kind: string, slug: string) => `/${kind}/${encodeURIComponent(slug)}`;
const KIND_HEADING: Record<string, string> = { release: "Releases", agency: "Agencies", location: "Locations", decade: "Decades" };
type HubLinkData = { kind: string; slug: string; label: string; count: number };
const hubLinks = (hs: HubLinkData[]) => hs.map((s) => ({ href: hubHref(s.kind, s.slug), text: `${s.label} (${s.count})` }));

export type HubPageData = {
  kind: string; title: string; intro: string; records: RecordLink[]; siblings: HubLinkData[];
  prev?: string | null; next?: string | null;
};

export function hubBody(h: HubPageData): string {
  const nav = [
    h.prev && a({ href: hubHref("release", h.prev), text: `← Release ${h.prev.padStart(2, "0")}` }),
    h.next && a({ href: hubHref("release", h.next), text: `Release ${h.next.padStart(2, "0")} →` }),
  ].filter(Boolean);
  return [
    `<p>${a({ href: "/browse", text: "Browse" })} › ${esc(KIND_HEADING[h.kind] ?? "")}</p>`,
    `<h1>${esc(h.title)}</h1>`,
    paras(h.intro),
    nav.length ? `<p>${nav.join(" · ")}</p>` : "",
    section(`Files (${h.records.length})`, docLinks(h.records)),
    section(`More ${(KIND_HEADING[h.kind] ?? "hubs").toLowerCase()}`, hubLinks(h.siblings)),
  ].join("");
}

export const browseBody = (hubs: HubLinkData[]) =>
  tabBody(
    "Browse the archive",
    "Every declassified UAP file, grouped by release, agency, location and decade.",
    ...["release", "agency", "location", "decade"].map((k) => section(KIND_HEADING[k], hubLinks(hubs.filter((h) => h.kind === k))))
  );
```

Add to `DocData` (after `fullText?`):

```ts
  hubs?: Partial<Record<"release" | "agency" | "location" | "decade", string>>;
```

In `docBody`, replace the `facts` declaration and the `<dl>` line with:

```ts
  const h = d.hubs ?? {};
  const facts: [string, string | null | undefined, string | undefined][] = [
    ["File", r.id, undefined],
    ["Agency", r.agency_full || r.agency, h.agency && hubHref("agency", h.agency)],
    ["Incident date", r.incident_date, h.decade && hubHref("decade", h.decade)],
    ["Location", r.location && r.location !== "N/A" ? r.location : null, h.location && hubHref("location", h.location)],
    ["Released in", d.release && `Release ${String(d.release.no).padStart(2, "0")} (${d.release.date})`, h.release && hubHref("release", h.release)],
    ["File type", r.kind.toUpperCase(), undefined],
    ["Length", dur ? mmss(dur) : null, undefined],
  ];
```

```ts
    `<dl>${facts
      .filter(([, v]) => v)
      .map(([k, v, href]) => `<dt>${k}</dt><dd>${href ? a({ href, text: String(v) }) : esc(String(v))}</dd>`)
      .join("")}</dl>`,
```

Add `{ href: "/browse", text: "Browse" }` to `NAV` after Archive.

- [ ] **Step 4: `worker/lib/pages.ts`** — imports `import { loadHub, listHubsCached } from "../routes/hubs";`, `hubBody, browseBody, hubHref` from `./ssr`, `type HubKind` from `./hubs`; add loaders and routes:

```ts
const hubPage =
  (kind: HubKind): Loader =>
  async (env, g, url) => {
    const h = await loadHub(env, kind, g.slug, url.origin);
    if (!h) return null;
    return {
      meta: {
        title: h.title,
        description: h.intro,
        type: "website",
        jsonLd: {
          "@type": "CollectionPage",
          name: h.title,
          description: h.intro,
          mainEntity: {
            "@type": "ItemList",
            numberOfItems: h.records.length,
            itemListElement: h.records.map((r, i) => ({ "@type": "ListItem", position: i + 1, url: `${url.origin}${docHref(r.id)}`, name: r.title })),
          },
        },
        breadcrumbs: [
          { name: "Home", href: "/" },
          { name: "Browse", href: "/browse" },
          { name: h.title, href: hubHref(kind, h.slug) },
        ],
      },
      body: hubBody(h),
    };
  };

const browsePage: Loader = async (env, _g, url) => ({
  meta: {
    title: "Browse the archive",
    description: "Every declassified UAP file, grouped by release, agency, location and decade.",
    type: "website",
  },
  body: browseBody(await listHubsCached(env, url.origin)),
});
```

and in `ROUTES` (before the `/doc/:id` entry):

```ts
  { pattern: new URLPattern({ pathname: "/browse" }), load: browsePage },
  { pattern: new URLPattern({ pathname: "/release/:slug" }), load: hubPage("release") },
  { pattern: new URLPattern({ pathname: "/agency/:slug" }), load: hubPage("agency") },
  { pattern: new URLPattern({ pathname: "/location/:slug" }), load: hubPage("location") },
  { pattern: new URLPattern({ pathname: "/decade/:slug" }), load: hubPage("decade") },
```

- [ ] **Step 5: Sitemap + routing**

`worker/routes/sitemap.ts`: import `listHubs` from `./hubs` and `hubHref` from `../lib/ssr`; add `listHubs(env)` as a 5th element of its `Promise.all` (destructure `hubs`), add `"/browse"` to the static list, and add after the cases line:

```ts
    ...hubs.map((h) => loc(hubHref(h.kind, h.slug))),
```

`wrangler.jsonc` `run_worker_first`: append `"/browse", "/release/*", "/agency/*", "/location/*", "/decade/*"`.

- [ ] **Step 6: Run the worker suite + typecheck**

Run: `npx vitest run --config worker/vitest.config.ts` and `npx tsc --noEmit`
Expected: all pass; tsc clean. The pre-existing ssr test `"<dt>Agency</dt><dd>Federal Bureau of Investigation</dd>"` still passes (no `hubs` in that fixture).

- [ ] **Step 7: Commit**

```bash
git add worker/lib/ssr.ts worker/lib/pages.ts worker/routes/sitemap.ts wrangler.jsonc worker/tests/ssr.spec.ts worker/tests/hubs.spec.ts
git commit -m "feat(hubs): pre-rendered hub + /browse pages, doc facts link to hubs, sitemap"
```

---

### Task 5: SPA — Hub + Browse screens, doc links, Archive link

**Files:**
- Create: `web/src/screens/Hub.tsx`, `web/src/screens/Browse.tsx`, `web/src/tests/hub.test.tsx`
- Modify: `web/src/api/types.ts`, `web/src/api/queries.ts`, `web/src/router.tsx`, `web/src/screens/Doc.tsx` (agency chip + `MetaCell` links), `web/src/screens/Archive.tsx` (browse link)
- Test: `web/src/tests/hub.test.tsx`, `web/src/tests/doc.test.tsx`, `web/src/tests/archive.test.tsx`

**Interfaces:**
- Consumes: `GET /api/hubs`, `GET /api/hubs/:kind/:slug`, `RecordDetail.hubs` (Tasks 3–4).
- Produces: `HubKind`, `HubSummary`, `Hub`, `HubLinks` types; `useHub(kind, slug)`, `useHubs()`; default exports `Hub({ kind })`, `Browse()`.

- [ ] **Step 1: Write the failing tests**

`web/src/tests/hub.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import type { Hub as HubData, HubSummary } from "../api/types";
import Hub from "../screens/Hub";
import Browse from "../screens/Browse";

const useHubMock = vi.fn();
const useHubsMock = vi.fn();
vi.mock("../api/queries", () => ({
  useHub: (kind: string, slug: string) => useHubMock(kind, slug),
  useHubs: () => useHubsMock(),
}));

const fbi: HubData = {
  kind: "agency", slug: "fbi", title: "FBI UAP files",
  intro: "5 declassified UAP files from the Federal Bureau of Investigation (FBI): 5 PDFs.",
  stats: { files: 1, pdf: 1, video: 0, image: 0, from: "2022", to: "2022" },
  records: [{
    id: "FBI-UAP-D002", archive: "wargov", agency: "FBI", title: "FBI-UAP-D002, FD-1057, Unresolved UAP Report", summary: "",
    kind: "pdf", redacted: 0, thumb: null, location: null, incident_date: "2022", doc_date: null,
  }],
  siblings: [{ kind: "agency", slug: "cia", label: "CIA", count: 22 }],
};
const hubs: HubSummary[] = [
  { kind: "release", slug: "6", label: "Release 06 · 18 Sep 2026", count: 74 },
  { kind: "agency", slug: "fbi", label: "FBI", count: 104 },
];

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/agency/:slug" element={<Hub kind="agency" />} />
        <Route path="/release/:slug" element={<Hub kind="release" />} />
        <Route path="/browse" element={<Browse />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  useHubMock.mockReset();
  useHubsMock.mockReset();
});

describe("Hub", () => {
  it("renders title, intro, file cards and sibling hubs", () => {
    useHubMock.mockReturnValue({ data: fbi, isLoading: false });
    const { container } = renderAt("/agency/fbi");
    expect(useHubMock).toHaveBeenCalledWith("agency", "fbi");
    expect(screen.getByRole("heading", { level: 1, name: "FBI UAP files" })).toBeInTheDocument();
    expect(screen.getByText(fbi.intro)).toBeInTheDocument();
    expect(container.querySelector('a[href^="/doc/FBI-UAP-D002"]')).not.toBeNull();
    expect(screen.getByRole("link", { name: "CIA · 22" })).toHaveAttribute("href", "/agency/cia");
  });

  it("release hubs link prev/next", () => {
    useHubMock.mockReturnValue({ data: { ...fbi, kind: "release", slug: "5", title: "Release 05", prev: "4", next: "6" }, isLoading: false });
    renderAt("/release/5");
    expect(screen.getByRole("link", { name: "← RELEASE 04" })).toHaveAttribute("href", "/release/4");
    expect(screen.getByRole("link", { name: "RELEASE 06 →" })).toHaveAttribute("href", "/release/6");
  });

  it("shows not found for a missing hub", () => {
    useHubMock.mockReturnValue({ data: undefined, isLoading: false });
    renderAt("/agency/nope");
    expect(screen.getByText("hub not found.")).toBeInTheDocument();
  });
});

describe("Browse", () => {
  it("groups hubs by kind and skips empty kinds", () => {
    useHubsMock.mockReturnValue({ data: { hubs }, isLoading: false });
    renderAt("/browse");
    expect(screen.getByRole("heading", { name: "RELEASES" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "AGENCIES" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "DECADES" })).toBeNull();
    expect(screen.getByRole("link", { name: "Release 06 · 18 Sep 2026 · 74" })).toHaveAttribute("href", "/release/6");
  });
});
```

Append inside `describe("Doc", …)` in `web/src/tests/doc.test.tsx`:

```tsx
  it("links the agency chip and meta values to their hubs when present", () => {
    useRecordMock.mockReturnValue({
      data: { ...mockDetail, hubs: { agency: "cia", location: "roswell", release: "4", decade: "1970s" } },
      isLoading: false,
    });
    renderDoc();
    expect(screen.getByRole("link", { name: "Central Intelligence Agency" })).toHaveAttribute("href", "/agency/cia");
    expect(screen.getByRole("link", { name: "Roswell, NM" })).toHaveAttribute("href", "/location/roswell");
    expect(screen.getByRole("link", { name: "1978-04-01" })).toHaveAttribute("href", "/release/4");
    expect(screen.getByRole("link", { name: "1978-03-04" })).toHaveAttribute("href", "/decade/1970s");
  });

  it("keeps agency and meta values as plain text without hubs", () => {
    renderDoc();
    expect(screen.queryByRole("link", { name: "Central Intelligence Agency" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Roswell, NM" })).toBeNull();
  });
```

Append inside the top-level `describe` of `web/src/tests/archive.test.tsx`:

```tsx
  it("links to the browse hubs page", async () => {
    renderAppAt("/archive");
    expect(await screen.findByRole("link", { name: "Browse by release · agency · location · decade →" })).toHaveAttribute("href", "/browse");
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `PATH=$HOME/.nvm/versions/node/v22.22.0/bin:$PATH pnpm -C web test -- src/tests/hub.test.tsx src/tests/doc.test.tsx src/tests/archive.test.tsx`
Expected: hub.test fails to import `../screens/Hub`; the new doc test fails (no link named "Central Intelligence Agency"); archive test fails (no browse link). The "plain text without hubs" doc test passes already (pins behaviour).

- [ ] **Step 3: Types + queries**

`web/src/api/types.ts` — add before `export interface RecordDetail`:

```ts
export type HubKind = "release" | "agency" | "location" | "decade";
export interface HubSummary { kind: HubKind; slug: string; label: string; count: number }
export interface Hub {
  kind: HubKind;
  slug: string;
  title: string;
  intro: string;
  stats: { files: number; pdf: number; video: number; image: number; from: string | null; to: string | null };
  records: ListRecordCard[];
  siblings: HubSummary[];
  /** Releases only: neighbouring release numbers. */
  prev?: string | null;
  next?: string | null;
}
/** Hub slugs this record's facts link to (only hubs that exist). */
export type HubLinks = Partial<Record<HubKind, string>>;
```

and inside `RecordDetail` (after `fullText?`): `hubs?: HubLinks;`

`web/src/api/queries.ts` — add to `qk`:

```ts
  hubs: ["hubs"] as const,
  hub: (kind: string, slug: string) => ["hub", kind, slug] as const,
```

add `Hub, HubSummary` to its type imports from `./types`, and:

```ts
export function useHubs() {
  return useQuery({ queryKey: qk.hubs, queryFn: () => api.get<{ hubs: HubSummary[] }>("/api/hubs") });
}

export function useHub(kind: string, slug: string) {
  return useQuery({
    queryKey: qk.hub(kind, slug),
    queryFn: () => api.get<Hub>(`/api/hubs/${kind}/${encodeURIComponent(slug)}`),
    enabled: !!slug,
    retry: false,
  });
}
```

- [ ] **Step 4: Screens** — `web/src/screens/Hub.tsx`

```tsx
// Hub landing page (spec 2026-10-02-realufo-hub-pages): every file for one
// release / agency / location / decade, with a data-written intro. The
// Worker pre-renders the same content for crawlers (worker/lib/ssr.ts hubBody).
import { Link, useParams } from "react-router-dom";
import { useHub } from "../api/queries";
import type { HubKind } from "../api/types";
import { DocCard } from "../components/DocCard";
import { useSetPageTitle } from "../lib/pageTitle";

export const KIND_LABEL: Record<HubKind, string> = { release: "RELEASE", agency: "AGENCY", location: "LOCATION", decade: "DECADE" };
export const KIND_PLURAL: Record<HubKind, string> = { release: "RELEASES", agency: "AGENCIES", location: "LOCATIONS", decade: "DECADES" };

export default function Hub({ kind }: { kind: HubKind }) {
  const { slug = "" } = useParams();
  const { data, isLoading } = useHub(kind, slug);
  useSetPageTitle(KIND_LABEL[kind], data?.title ?? "", data?.title);

  if (isLoading) {
    return (
      <div data-screen="hub" className="font-mono text-[11px] text-faint">
        ◉ loading signal…
      </div>
    );
  }
  if (!data) {
    return (
      <div data-screen="hub" className="px-5 py-[60px] text-center font-mono text-[12px] text-faint">
        hub not found.
      </div>
    );
  }
  return (
    <div data-screen="hub" style={{ animation: "fadeup .3s ease both" }}>
      <div className="mb-1 font-mono text-[11px] font-semibold tracking-[.4px] text-faint">
        <Link to="/browse" className="hover:text-signal">BROWSE</Link> › {KIND_PLURAL[kind]}
      </div>
      <h1 className="mb-2 text-[19px] font-bold leading-[1.3] text-ink">{data.title}</h1>
      <p className="mb-4 text-[14.5px] leading-[1.65] text-dim">{data.intro}</p>
      {(data.prev || data.next) && (
        <div className="mb-4 flex justify-between font-mono text-xs text-ink">
          {data.prev ? <Link to={`/release/${data.prev}`}>← RELEASE {data.prev.padStart(2, "0")}</Link> : <span />}
          {data.next ? <Link to={`/release/${data.next}`}>RELEASE {data.next.padStart(2, "0")} →</Link> : <span />}
        </div>
      )}
      <div className="mb-6 grid grid-cols-2 gap-3 min-[900px]:grid-cols-[repeat(auto-fill,minmax(210px,1fr))]">
        {data.records.map((r) => (
          <DocCard key={r.id} record={r} variant="grid" />
        ))}
      </div>
      {data.siblings.length > 0 && (
        <section aria-labelledby="hub-more">
          <h2 id="hub-more" className="mb-2 font-mono text-[11px] font-semibold tracking-[.5px] text-ink">
            MORE {KIND_PLURAL[kind]}
          </h2>
          <div className="flex flex-wrap gap-[7px]">
            {data.siblings.map((s) => (
              <Link
                key={s.slug}
                to={`/${s.kind}/${s.slug}`}
                className="rounded-[7px] border border-line px-[9px] py-1 font-mono text-[10px] text-dim"
              >
                {s.label} · {s.count}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
```

`web/src/screens/Browse.tsx`

```tsx
// /browse — every hub (release, agency, location, decade) with its file count.
import { Link } from "react-router-dom";
import { useHubs } from "../api/queries";
import type { HubKind } from "../api/types";
import { useSetPageTitle } from "../lib/pageTitle";
import { KIND_PLURAL } from "./Hub";

const KINDS: HubKind[] = ["release", "agency", "location", "decade"];

export default function Browse() {
  const { data, isLoading } = useHubs();
  useSetPageTitle("BROWSE", "", "Browse the archive");
  if (isLoading) {
    return (
      <div data-screen="browse" className="font-mono text-[11px] text-faint">
        ◉ loading signal…
      </div>
    );
  }
  const hubs = data?.hubs ?? [];
  return (
    <div data-screen="browse" style={{ animation: "fadeup .3s ease both" }}>
      <h1 className="mb-4 text-[19px] font-bold leading-[1.3] text-ink">Browse the archive</h1>
      {KINDS.map((k) => {
        const group = hubs.filter((h) => h.kind === k);
        if (!group.length) return null;
        return (
          <section key={k} className="mb-5" aria-labelledby={`browse-${k}`}>
            <h2 id={`browse-${k}`} className="mb-2 font-mono text-[11px] font-semibold tracking-[.5px] text-ink">
              {KIND_PLURAL[k]}
            </h2>
            <div className="flex flex-wrap gap-[7px]">
              {group.map((h) => (
                <Link
                  key={h.slug}
                  to={`/${h.kind}/${h.slug}`}
                  className="rounded-[7px] border border-line px-[9px] py-1 font-mono text-[10px] text-dim"
                >
                  {h.label} · {h.count}
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 5: Router, Doc links, Archive link**

`web/src/router.tsx`: `import Hub from "./screens/Hub";`, `import Browse from "./screens/Browse";` and add children:

```tsx
      { path: "/browse", element: <Browse /> },
      { path: "/release/:slug", element: <Hub kind="release" /> },
      { path: "/agency/:slug", element: <Hub kind="agency" /> },
      { path: "/location/:slug", element: <Hub kind="location" /> },
      { path: "/decade/:slug", element: <Hub kind="decade" /> },
```

`web/src/screens/Doc.tsx`:
- `MetaCellProps` gains `to?: string`; `MetaCell({ label, value, to })` renders the value as `{to ? <Link to={to} className="hover:text-signal">{value}</Link> : value}` inside the existing value `<div>`.
- In the meta grid: `<MetaCell label="Incident" value={record.incident_date || ""} to={detail.hubs?.decade && `/decade/${detail.hubs.decade}`} />`, Location `to={detail.hubs?.location && `/location/${detail.hubs.location}`}`, Released `to={detail.hubs?.release && `/release/${detail.hubs.release}`}`.
- Agency chip: when `detail.hubs?.agency`, render the same chip as `<Link to={`/agency/${detail.hubs.agency}`} className="<same classes>" style={{ color: accent }}>` instead of `<span>`.

`web/src/screens/Archive.tsx`: change the router import to `import { Link, useSearchParams } from "react-router-dom";` and insert right after the `release.realufo.org` `</a>`:

```tsx
      <Link to="/browse" className="mb-3.5 block font-mono text-[11px] text-dim hover:text-signal">
        Browse by release · agency · location · decade →
      </Link>
```

- [ ] **Step 6: Run web tests + build**

Run: `PATH=$HOME/.nvm/versions/node/v22.22.0/bin:$PATH pnpm -C web test` then `PATH=$HOME/.nvm/versions/node/v22.22.0/bin:$PATH pnpm -C web build`
Expected: all web tests pass (hub.test 4, doc +2, archive +1); build (tsc -b) clean. `MetaCell`'s `to` accepts `string | undefined` — `detail.hubs?.x && "…"` yields `string | undefined`, which matches.

- [ ] **Step 7: Commit**

```bash
git add web/src/screens/Hub.tsx web/src/screens/Browse.tsx web/src/tests/hub.test.tsx web/src/api/types.ts web/src/api/queries.ts web/src/router.tsx web/src/screens/Doc.tsx web/src/screens/Archive.tsx web/src/tests/doc.test.tsx web/src/tests/archive.test.tsx
git commit -m "feat(hubs): Hub + Browse screens, doc facts link to hubs, Archive browse link"
```

---

### Task 6: Merge, deploy, verify (needs user go-ahead)

- [ ] **Step 1: STOP — ask the user** to merge + deploy, reporting: branch test totals, what else is on `build/app-foundation` since the branch point, the latest `wrangler deployments list` entry, and whether another chat's deploy worktree is ahead of the merge (`git merge-base --is-ancestor`).

- [ ] **Step 2: After go-ahead** — merge into `build/app-foundation` in the shared checkout (`git merge --no-edit <branch>`), re-run worker + web + crawler suites on the merged commit in a clean detached worktree, deploy from that worktree:

```bash
env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID pnpm build:web
env -u CLOUDFLARE_API_TOKEN -u CLOUDFLARE_ACCOUNT_ID npx wrangler deploy --env-file /dev/null
```

- [ ] **Step 3: Verify live**

```bash
for p in /release/6 /agency/fbi /location/las-vegas-nevada /decade/1950s /browse; do
  curl -s -A Googlebot "https://realufo.org$p" | grep -o "<h1>[^<]*" | head -1
done
curl -s https://realufo.org/api/hubs | python3 -c 'import json,sys; h=json.load(sys.stdin)["hubs"]; print(len(h), sorted({x["kind"] for x in h}))'
curl -s https://realufo.org/sitemap.xml | grep -c "/agency/\|/release/\|/location/\|/decade/"
```

Expected: five h1s (`Release 06 · 18 Sep 2026`, `FBI UAP files`, `UAP files: Las Vegas, Nevada`, `1950s UAP files`, `Browse the archive`); ~43 hubs over 4 kinds; sitemap count ≈ hub count. Then in the browser pane: doc page → agency chip → hub → another doc; no console errors.

- [ ] **Step 4: Clean up** the worktree and branch; record the release in project-state memory.
