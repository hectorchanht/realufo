# Shorts player + searchable Shorts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Social-posted 9:16 Shorts play as Shorts in the app (`/shorts/:id`, swipe to next) and show up in `/archive` search.

**Architecture:** Shorts are derived per request from R2 listings (`showcase/`, `clips-v/`) ∩ live D1 records (approach A, no table). One worker function `listShorts` feeds `/api/feed` (`clips`) and new `/api/shorts?q=`. Web gets a `useShorts` hook, a shared `ShortsRow` (autoplaying 9:16 cards) used by the home row and the archive strip, and a full-screen scroll-snap player screen.

**Tech Stack:** Cloudflare Worker + D1 (SQLite) + R2, vitest-pool-workers; React 19 + react-router 7 + TanStack Query + Tailwind, vitest + testing-library.

**Spec:** `docs/superpowers/specs/2026-10-03-realufo-shorts-player-design.md`

## Global Constraints

- A Short = live record + R2 object `showcase/<archive>/<ID>.mp4` (wins) or `clips-v/<archive>/<ID>.mp4`. One per record.
- Order: showcase newest `x_posts.created_at` first → showcase without post row → twins: portrait (`assets.crop` w < h) first, then `created_at DESC, id DESC`.
- `/api/shorts` `limit` default and max 200; feed uses 20.
- Any R2/D1 failure → `[]`; the feed never fails because of Shorts.
- `/shorts/:id` crawler HTML = doc page with canonical `/doc/:id`; not in sitemap/IndexNow.
- Player starts muted; plays even under prefers-reduced-motion.
- Deploy only from a clean worktree with `pnpm run deploy` (runs D1 migrations), Node 22; push the deployed commit.

## Review Focus

1. Record IDs with spaces / special chars (live AARO id has a space) — every link and clip URL must `encodeURIComponent` the id; player must find the slide for a decoded `:id`.
2. `q` of only punctuation (`?q=!!`) — must return `[]`, not every showcase Short.
3. Opening `/shorts/:id?q=x` where `:id` no longer matches `x` — falls back to the all-Shorts queue, still opens on `:id`.
4. Unknown `/shorts/NOPE` — "Short not found" state, not a blank black screen.
5. Showcase record that also has a `clips-v` twin — listed once, served from `showcase/`.

---

## File Structure

- Create `worker/routes/shorts.ts` — `listShorts(env, opts)` + `shorts` route handler.
- Modify `worker/routes/feed.ts` — drop `feedClips`, call `listShorts`.
- Modify `worker/routes/records.ts` — `export` `metaMatch`.
- Modify `worker/index.ts` — register `GET /api/shorts`.
- Modify `worker/lib/pages.ts` — `/shorts/:id` SSR route.
- Create `worker/tests/shorts.spec.ts`; modify `worker/tests/feed.spec.ts` (move feedClips cases out); modify `worker/tests/meta.spec.ts`.
- Modify `web/src/api/types.ts` (`Short`), `web/src/api/queries.ts` (`qk.shorts`, `useShorts`).
- Create `web/src/lib/useAutoplayInView.ts`, `web/src/components/ShortsRow.tsx`.
- Modify `web/src/screens/Feed.tsx` (row uses `ShortsRow`, links `/shorts/:id`).
- Create `web/src/screens/Shorts.tsx`; modify `web/src/router.tsx`.
- Modify `web/src/screens/Archive.tsx` (strip).
- Tests: `web/src/tests/feed.test.tsx`, `web/src/tests/archive.test.tsx`, create `web/src/tests/shorts.test.tsx`.

---

### Task 1: `listShorts` + `/api/shorts`

**Files:**
- Create: `worker/routes/shorts.ts`
- Modify: `worker/routes/feed.ts`, `worker/routes/records.ts` (`function metaMatch` → `export function metaMatch`), `worker/index.ts`
- Test: `worker/tests/shorts.spec.ts` (new), `worker/tests/feed.spec.ts` (remove `feedClips` describe + import)

**Interfaces:**
- Produces: `listShorts(env: Env, opts?: { q?: string; limit?: number }): Promise<Short[]>` where `Short = { id: string; title: string | null; thumb: string | null; clip: string; showcase: boolean }`; `GET /api/shorts?q=&limit=` → `Short[]` JSON.

- [ ] **Step 1: Write the failing test** — `worker/tests/shorts.spec.ts`:

```ts
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import { seedTestDB } from "./helpers";
import { listShorts } from "../routes/shorts";
import worker from "../index";

const rec = (id: string, status = "live", title = `Title ${id}`) =>
  env.DB.prepare("INSERT INTO records(id,archive,kind,title,status,created_at) VALUES (?,'wargov','video',?,?,?)")
    .bind(id, title, status, `2026-09-0${id.slice(-1)} 00:00:00`).run();
const put = (key: string) => env.MEDIA.put(key, new Uint8Array(1));
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

describe("listShorts", () => {
  beforeAll(async () => {
    await seedTestDB(env.DB);
    await rec("SH-1"); await rec("SH-2"); await rec("SH-3", "failed"); await rec("SH-4");
    await rec("SH-5", "live", "Gimbal over the sea"); await rec("SH-6"); await rec("SH 7");
    for (const id of ["SH-1", "SH-2", "SH-3"]) await put(`clips-v/wargov/${id}.mp4`);
    for (const id of ["SH-5", "SH-6", "SH-1", "SH 7"]) await put(`showcase/wargov/${id}.mp4`);
    await env.DB.prepare(
      `INSERT INTO x_posts(stream,ref,text,ai,cost_usd,status,created_at) VALUES
       ('showcase','SH-5','Two stars twelve years apart',0,0,'posted','2026-10-03 10:00:00'),
       ('showcase','SH-6','A teardrop over the ocean',0,0,'posted','2026-10-03 11:00:00')`
    ).run();
    await env.DB.prepare("INSERT INTO assets(record_id,role,cdn_url,mime,crop) VALUES ('SH-2','full','x','video/mp4','616:1080:652:0')").run();
  });

  it("showcase first by post time, then twins (portrait first, then newest); live + object only", async () => {
    const s = await listShorts(env as any);
    // SH-6/SH-5 posted; SH-1 and "SH 7" showcase without post row (created_at DESC); SH-2 portrait twin; SH-3 not live; SH-4 no object
    expect(ids(s)).toEqual(["SH-6", "SH-5", "SH 7", "SH-1", "SH-2"]);
  });

  it("showcase wins over its twin, once, served from showcase/; ids are URL-encoded", async () => {
    const s = await listShorts(env as any);
    expect(s.filter((x) => x.id === "SH-1")).toHaveLength(1);
    expect(s.find((x) => x.id === "SH-1")).toMatchObject({ showcase: true, clip: "https://assets.realufo.org/showcase/wargov/SH-1.mp4" });
    expect(s.find((x) => x.id === "SH 7")!.clip).toBe("https://assets.realufo.org/showcase/wargov/SH%207.mp4");
    expect(s.find((x) => x.id === "SH-2")).toMatchObject({ showcase: false, clip: "https://assets.realufo.org/clips-v/wargov/SH-2.mp4" });
  });

  it("q matches record title and showcase post text; punctuation-only q matches nothing", async () => {
    expect(ids(await listShorts(env as any, { q: "gimbal" }))).toEqual(["SH-5"]);
    expect(ids(await listShorts(env as any, { q: "teardrop ocean" }))).toEqual(["SH-6"]);
    expect(ids(await listShorts(env as any, { q: "!!" }))).toEqual([]);
  });

  it("q matches page text (record_fts)", async () => {
    await env.DB.prepare("INSERT INTO record_fts(record_id,page,body) VALUES ('SH-2',1,'sonobuoy contact report')").run();
    expect(ids(await listShorts(env as any, { q: "sonobuoy" }))).toEqual(["SH-2"]);
  });

  it("limit caps the list", async () => {
    expect(await listShorts(env as any, { limit: 2 })).toHaveLength(2);
  });

  it("degrades to [] when R2 listing fails", async () => {
    const broken = { ...env, MEDIA: { list: () => Promise.reject(new Error("r2 down")) } };
    expect(await listShorts(broken as any)).toEqual([]);
  });

  it("GET /api/shorts?q= serves the list; /api/feed clips still come from it", async () => {
    const get = async (p: string) => {
      const ctx = createExecutionContext();
      const res = await worker.fetch(new Request("https://x" + p), env as any, ctx);
      await waitOnExecutionContext(ctx);
      return res.json() as Promise<any>;
    };
    expect(ids(await get("/api/shorts?q=gimbal"))).toEqual(["SH-5"]);
    expect(ids((await get("/api/feed")).clips).slice(0, 2)).toEqual(["SH-6", "SH-5"]);
  });
});
```

Remove from `worker/tests/feed.spec.ts` the whole `describe("feedClips", …)` block and change its import to `import { trendScore } from "../routes/feed";` (drop `beforeAll`/`seedTestDB` imports if now unused).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config worker/vitest.config.ts worker/tests/shorts.spec.ts`
Expected: FAIL — cannot resolve `../routes/shorts`.

- [ ] **Step 3: Implement** — `worker/routes/shorts.ts`:

```ts
import type { Env } from "../env";
import { json } from "../lib/json";
import { thumbSql } from "../lib/db";
import { clipIds } from "../lib/xpick";
import { ftsQuery, metaMatch } from "./records";

export type Short = { id: string; title: string | null; thumb: string | null; clip: string; showcase: boolean };
const MAX = 200;

// A Short = a live record with a 9:16 video in R2: an operator showcase Short
// (showcase/, scripts/publish.sh --showcase, wins) or the auto-cut twin (clips-v/).
// The object's existence is the flag — no D1 table. Order: showcase by newest
// post, showcase without a post row, then twins (portrait sources first — their
// twin is the whole picture — then newest). q = the archive search (metadata or
// page text) or, for showcase Shorts, every word in the posted text.
// Never throws: an R2/D1 error is an empty list (the feed must not fail).
export async function listShorts(env: Env, { q = "", limit = MAX }: { q?: string; limit?: number } = {}): Promise<Short[]> {
  try {
    const [showcase, twins] = await Promise.all([clipIds(env, "showcase/"), clipIds(env, "clips-v/")]);
    if (!showcase.length && !twins.length) return [];
    const where = ["r.status='live'", "(r.id IN (SELECT id FROM sc) OR r.id IN (SELECT id FROM cv))"];
    const bind: unknown[] = [JSON.stringify(showcase), JSON.stringify(twins)];
    q = q.trim();
    if (q) {
      const meta = metaMatch(q);
      const fts = ftsQuery(q);
      const text = meta.bind.length
        ? `EXISTS (SELECT 1 FROM x_posts x WHERE x.stream='showcase' AND x.ref=r.id AND ${meta.bind.map(() => "lower(x.text) LIKE ?").join(" AND ")})`
        : "0";
      where.push(`((${meta.sql})${fts ? " OR r.id IN (SELECT record_id FROM record_fts WHERE record_fts MATCH ?)" : ""} OR (r.id IN (SELECT id FROM sc) AND ${text}))`);
      bind.push(...meta.bind, ...(fts ? [fts] : []), ...meta.bind);
    }
    const { results } = await env.DB.prepare(
      `WITH sc(id) AS (SELECT value FROM json_each(?)), cv(id) AS (SELECT value FROM json_each(?))
       SELECT r.id, r.archive, r.title, ${thumbSql("r.id")} thumb,
         r.id IN (SELECT id FROM sc) showcase,
         CASE WHEN r.id IN (SELECT id FROM sc) THEN (SELECT max(x.created_at) FROM x_posts x WHERE x.stream='showcase' AND x.ref=r.id) END posted,
         (SELECT CAST(substr(a.crop, 1, instr(a.crop, ':') - 1) AS INT) < CAST(substr(a.crop, instr(a.crop, ':') + 1) AS INT)
            FROM assets a WHERE a.record_id=r.id AND a.role='full') portrait
       FROM records r WHERE ${where.join(" AND ")}
       ORDER BY showcase DESC, posted DESC, portrait DESC, r.created_at DESC, r.id DESC LIMIT ?`
    ).bind(...bind, Math.min(MAX, Math.max(1, limit || MAX)))
      .all<{ id: string; archive: string; title: string | null; thumb: string | null; showcase: number }>();
    return results.map(({ id, archive, title, thumb, showcase }) => ({
      id, title, thumb, showcase: !!showcase,
      clip: `https://assets.realufo.org/${showcase ? "showcase" : "clips-v"}/${archive}/${encodeURIComponent(id)}.mp4`,
    }));
  } catch {
    return [];
  }
}

// GET /api/shorts?q=&limit= — the Shorts player queue and the archive search strip.
export async function shorts(req: Request, env: Env) {
  const u = new URL(req.url);
  return json(await listShorts(env, { q: u.searchParams.get("q") ?? "", limit: Number(u.searchParams.get("limit")) || MAX }));
}
```

`worker/routes/records.ts`: `function metaMatch(` → `export function metaMatch(`.

`worker/routes/feed.ts`: delete the `feedClips` function and its comment; import `listShorts` from `./shorts` instead of `clipIds`; `clips: await feedClips(env),` → `clips: await listShorts(env, { limit: 20 }),`.

`worker/index.ts`: `import { shorts } from "./routes/shorts";` and after `on("GET", "/api/feed", feed);` add `on("GET", "/api/shorts", shorts);`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run --config worker/vitest.config.ts worker/tests/shorts.spec.ts worker/tests/feed.spec.ts`
Expected: PASS. If the `!!` case fails, check `metaMatch` returns `bind: []` for no words (it does: `sql: "0"`).

- [ ] **Step 5: Commit**

```bash
git add worker/routes/shorts.ts worker/routes/feed.ts worker/routes/records.ts worker/index.ts worker/tests/shorts.spec.ts worker/tests/feed.spec.ts
git commit -m "feat(shorts): listShorts + GET /api/shorts with archive-search q"
```

### Task 2: `/shorts/:id` crawler HTML → canonical doc page

**Files:**
- Modify: `worker/lib/pages.ts` (ROUTES table, after `/doc/:id`)
- Test: `worker/tests/meta.spec.ts` (next to the `/doc/:id` tests, ~line 151)

**Interfaces:** Consumes `docPage` loader (same file). Produces nothing new.

- [ ] **Step 1: Write the failing test** (inside the describe that has `fakeAssets` and the `/doc/CIA-UAP-017` test):

```ts
  it("/shorts/:id serves the doc page's meta with the doc URL as canonical", async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(new Request("https://x/shorts/CIA-UAP-017", { headers: { accept: "text/html" } }), { ...env, ASSETS: fakeAssets } as any, ctx);
    await waitOnExecutionContext(ctx);
    const html = await res.text();
    expect(html).toContain('<link rel="canonical" href="https://x/doc/CIA-UAP-017">');
    expect(html).toContain("CIA-UAP-017");
  });
```

- [ ] **Step 2: Run** `npx vitest run --config worker/vitest.config.ts worker/tests/meta.spec.ts -t "shorts"` — Expected: FAIL (no canonical / generic shell).

- [ ] **Step 3: Implement** — in `worker/lib/pages.ts` before `ROUTES`:

```ts
// A Short is the doc's video cut 9:16: same page for crawlers, canonical = the doc.
const shortPage: Loader = async (env, g, url) => {
  const p = await docPage(env, g, url);
  return p && { ...p, canonicalPath: docHref(g.id) };
};
```

and in `ROUTES` after the `/doc/:id` line: `{ pattern: new URLPattern({ pathname: "/shorts/:id" }), load: shortPage },`. (`g.id` arrives percent-decoded the same way as for `/doc/:id`; if the doc test at line 151 shows decoding happens in the loader, reuse it unchanged since `shortPage` delegates.)

- [ ] **Step 4: Run** the same command — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add worker/lib/pages.ts worker/tests/meta.spec.ts
git commit -m "feat(shorts): /shorts/:id crawler HTML canonical to /doc/:id"
```

### Task 3: Web data + shared `ShortsRow`; home row opens the player

**Files:**
- Modify: `web/src/api/types.ts`, `web/src/api/queries.ts`, `web/src/screens/Feed.tsx`
- Create: `web/src/lib/useAutoplayInView.ts`, `web/src/components/ShortsRow.tsx`
- Test: `web/src/tests/feed.test.tsx`

**Interfaces:**
- Produces: `interface Short { id: string; title: string | null; thumb: string | null; clip: string; showcase?: boolean }` (replaces `FeedClip`; `Feed.clips?: Short[]`); `qk.shorts(q: string)`; `useShorts(q?: string, opts?: { enabled?: boolean })` → `UseQueryResult<Short[]>`; `useAutoplayInView(root: RefObject<HTMLElement | null>, deps: unknown[], onShow?: (v: HTMLVideoElement) => void)`; `ShortsRow({ shorts, loading?, href }: { shorts: Short[]; loading?: boolean; href: (s: Short) => string })`.

- [ ] **Step 1: Update the failing test** — in `web/src/tests/feed.test.tsx`, rename the clips test and change the href assertion:

```ts
  it("renders the short clips row: muted inline clip tiles opening the Shorts player", async () => {
    renderAppAt("/");
    const tile = await screen.findByRole("link", { name: /Gulf of Oman orb/ });
    expect(tile).toHaveAttribute("href", "/shorts/vid1");
```
(rest of that test unchanged).

- [ ] **Step 2: Run** `cd web && npx vitest run src/tests/feed.test.tsx` — Expected: FAIL (`href` is `/doc/vid1`).

- [ ] **Step 3: Implement**

`web/src/api/types.ts`: rename `export interface FeedClip {` → `export interface Short {`, add `showcase?: boolean;` and in `Feed` change `clips?: FeedClip[]` → `clips?: Short[]`.

`web/src/api/queries.ts`: add `Short` to the type import; in `qk` add `shorts: (q: string) => ["shorts", q] as const,`; after `useFeed` add:

```ts
// Shorts player queue / archive search strip. q="" = every Short.
export function useShorts(q = "", { enabled = true } = {}) {
  return useQuery({
    queryKey: qk.shorts(q),
    queryFn: () => api.get<Short[]>(`/api/shorts${q ? `?q=${encodeURIComponent(q)}` : ""}`),
    enabled,
  });
}
```

`web/src/lib/useAutoplayInView.ts`:

```ts
import { useEffect, useRef, type RefObject } from "react";

// Plays each <video> under `root` while ≥60% on screen, pauses it otherwise.
// Plays even under prefers-reduced-motion: Android reports that for "animation
// scale 0" (a common battery/speed tweak), which left clips frozen on phones.
export function useAutoplayInView(root: RefObject<HTMLElement | null>, deps: unknown[], onShow?: (v: HTMLVideoElement) => void) {
  const show = useRef(onShow);
  show.current = onShow;
  useEffect(() => {
    if (!root.current || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const v = e.target as HTMLVideoElement;
          if (e.isIntersecting) {
            v.play().catch(() => {});
            show.current?.(v);
          } else v.pause();
        }
      },
      { threshold: 0.6 }
    );
    root.current.querySelectorAll("video").forEach((v) => io.observe(v));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
```

`web/src/components/ShortsRow.tsx`:

```tsx
import { useRef } from "react";
import { Link } from "react-router-dom";
import type { Short } from "../api/types";
import { docTitleParts } from "../lib/docTitle";
import { useAutoplayInView } from "../lib/useAutoplayInView";

// Horizontal row of 9:16 Short cards (muted, looping, playing while on screen).
export function ShortsRow({ shorts, loading = false, href }: { shorts: Short[]; loading?: boolean; href: (s: Short) => string }) {
  const row = useRef<HTMLDivElement>(null);
  useAutoplayInView(row, [shorts]);
  return (
    <div ref={row} data-scroll aria-busy={loading} className="flex snap-x snap-mandatory gap-[10px] overflow-x-auto pb-1.5">
      {loading
        ? Array.from({ length: 4 }, (_, i) => (
            <div key={i} aria-hidden="true" className="aspect-[9/16] w-[132px] shrink-0 rounded-[14px] border border-line bg-surface" />
          ))
        : shorts.map((s) => (
            <Link
              key={s.id}
              to={href(s)}
              aria-label={docTitleParts(s.id, s.title, "video").title}
              className="aspect-[9/16] w-[132px] shrink-0 snap-start overflow-hidden rounded-[14px] border border-line bg-bg2"
            >
              <video src={s.clip} poster={s.thumb ?? undefined} muted loop playsInline preload="none" aria-hidden="true" className="h-full w-full object-cover" />
            </Link>
          ))}
    </div>
  );
}

export const shortHref = (s: Short, q = "") => `/shorts/${encodeURIComponent(s.id)}${q ? `?q=${encodeURIComponent(q)}` : ""}`;
```

`web/src/screens/Feed.tsx`: replace `ClipCarousel`'s body so it keeps its header and renders `<ShortsRow shorts={clips} loading={loading} href={(s) => shortHref(s)} />` instead of the inline row; delete its `useRef`/`useEffect` IO code; `FeedClip` → `Short` in the import and prop type; import `ShortsRow, shortHref` from `../components/ShortsRow`; drop now-unused `useEffect, useRef` / `docTitleParts` imports only if nothing else in the file uses them. Update the comment above `ClipCarousel` to say tiles open the Shorts player.

- [ ] **Step 4: Run** `cd web && npx vitest run src/tests/feed.test.tsx` — Expected: PASS (incl. the reduced-motion play test, now exercising `useAutoplayInView`).

- [ ] **Step 5: Commit**

```bash
git add web/src/api/types.ts web/src/api/queries.ts web/src/lib/useAutoplayInView.ts web/src/components/ShortsRow.tsx web/src/screens/Feed.tsx web/src/tests/feed.test.tsx
git commit -m "feat(shorts): useShorts + shared ShortsRow; home clips open /shorts/:id"
```

### Task 4: Shorts player screen

**Files:**
- Create: `web/src/screens/Shorts.tsx`
- Modify: `web/src/router.tsx` (add `{ path: "/shorts/:id", lazy: screen(() => import("./screens/Shorts")) },` after `/doc/:id`)
- Test: `web/src/tests/shorts.test.tsx`

**Interfaces:** Consumes `useShorts`, `Short`, `useAutoplayInView`, `shareLink` (`web/src/lib/shareLink.ts`), `goBack` (`web/src/components/navItems.ts`), `docTitleParts`.

- [ ] **Step 1: Write the failing test** — `web/src/tests/shorts.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import type { Short } from "../api/types";
import { renderAppAt } from "./util";

const all: Short[] = [
  { id: "A-1", title: "First", thumb: null, clip: "https://c/A-1.mp4", showcase: true },
  { id: "B 2", title: "Second", thumb: null, clip: "https://c/B%202.mp4" },
  { id: "C-3", title: "Third", thumb: null, clip: "https://c/C-3.mp4" },
];
const useShortsMock = vi.fn();
vi.mock("../api/queries", () => ({
  useBootstrap: () => ({ data: undefined, isLoading: false }),
  useShorts: (q: string, o?: { enabled?: boolean }) => useShortsMock(q, o),
}));
beforeEach(() => {
  useShortsMock.mockReset();
  useShortsMock.mockImplementation((q: string) =>
    q ? { data: all.filter((s) => s.title!.toLowerCase().includes(q)), isFetched: true } : { data: all, isFetched: true }
  );
});

describe("Shorts player", () => {
  it("renders one slide per Short, muted, each with a View file link", async () => {
    renderAppAt("/shorts/B%202");
    const videos = (await screen.findAllByTestId("short-video")) as HTMLVideoElement[];
    expect(videos).toHaveLength(3);
    expect(videos.every((v) => v.muted)).toBe(true);
    expect(screen.getAllByRole("link", { name: /view file/i })[1]).toHaveAttribute("href", "/doc/B%202");
  });

  it("sound button unmutes every slide", async () => {
    renderAppAt("/shorts/A-1");
    fireEvent.click((await screen.findAllByRole("button", { name: /unmute/i }))[0]);
    expect((screen.getAllByTestId("short-video") as HTMLVideoElement[]).every((v) => !v.muted)).toBe(true);
  });

  it("q queue when it contains :id, else all Shorts", async () => {
    renderAppAt("/shorts/C-3?q=third");
    expect(await screen.findAllByTestId("short-video")).toHaveLength(1);
  });

  it("falls back to all Shorts when :id is not in the q results", async () => {
    renderAppAt("/shorts/A-1?q=third");
    expect(await screen.findAllByTestId("short-video")).toHaveLength(3);
  });

  it("unknown id → not found with a doc link", async () => {
    renderAppAt("/shorts/NOPE");
    expect(await screen.findByText(/short not found/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open the file/i })).toHaveAttribute("href", "/doc/NOPE");
  });
});
```

- [ ] **Step 2: Run** `cd web && npx vitest run src/tests/shorts.test.tsx` — Expected: FAIL (route/screen missing → NotFound).

- [ ] **Step 3: Implement** — `web/src/screens/Shorts.tsx`:

```tsx
// Shorts player (/shorts/:id[?q=]): full-screen vertical scroll-snap list of the
// 9:16 Shorts we post to social, opened at :id. The slide ≥60% on screen plays;
// the URL follows it (replace) so the address bar is always the shareable Short.
// Queue = the ?q= search results when they contain :id, else every Short.
// Starts muted (autoplay policy); the sound button / tapping a video toggles all.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useShorts } from "../api/queries";
import { goBack } from "../components/navItems";
import { docTitleParts } from "../lib/docTitle";
import { shareLink } from "../lib/shareLink";
import { useAutoplayInView } from "../lib/useAutoplayInView";
import { useSetPageTitle } from "../lib/pageTitle";

const path = (id: string, q: string) => `/shorts/${encodeURIComponent(id)}${q ? `?q=${encodeURIComponent(q)}` : ""}`;

export default function Shorts() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const q = params.get("q") ?? "";
  const navigate = useNavigate();
  const { pathname } = useLocation();
  useSetPageTitle("SHORTS", "Declassified UAP clips");

  const searched = useShorts(q, { enabled: !!q });
  const inQ = !!searched.data?.some((s) => s.id === id);
  const all = useShorts("", { enabled: !q || (searched.isFetched && !inQ) });
  const shorts = inQ ? searched.data! : all.data;
  const pending = (q && !searched.isFetched) || (!inQ && !all.isFetched);

  const root = useRef<HTMLDivElement>(null);
  const [muted, setMuted] = useState(true);
  const [copied, setCopied] = useState("");
  const opened = useRef(false);
  const found = !!shorts?.some((s) => s.id === id);

  // Open on :id once; later :id changes come from scrolling, not navigation.
  useLayoutEffect(() => {
    if (opened.current || !found) return;
    opened.current = true;
    document.getElementById(`short-${id}`)?.scrollIntoView?.({ block: "start" });
  }, [found, id]);

  useAutoplayInView(root, [shorts], (v) => {
    const sid = v.dataset.id;
    if (opened.current && sid && sid !== id) navigate(path(sid, inQ ? q : ""), { replace: true });
  });

  useEffect(() => {
    root.current?.querySelectorAll("video").forEach((v) => (v.muted = muted));
  }, [muted, shorts]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input,textarea")) return;
      const step = { ArrowDown: 1, j: 1, ArrowUp: -1, k: -1 }[e.key];
      if (step) {
        e.preventDefault();
        root.current?.scrollBy?.({ top: step * root.current.clientHeight, behavior: "smooth" });
      } else if (e.key === "Escape") goBack(navigate, pathname);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, pathname]);

  const back = (
    <button type="button" onClick={() => goBack(navigate, pathname)} aria-label="Back"
      className="absolute left-3 top-3 z-10 rounded-full bg-black/50 px-3 py-1.5 font-mono text-[13px] text-white">
      ‹ Shorts
    </button>
  );

  return (
    <div data-screen="shorts" className="fixed inset-0 z-[60] bg-black">
      {back}
      {pending ? (
        <div className="grid h-full place-items-center font-mono text-[11px] text-white/60">◉ loading signal…</div>
      ) : !found ? (
        <div className="grid h-full place-items-center px-6 text-center font-mono text-[12px] text-white/70">
          <div>
            Short not found.
            <br />
            <Link to={`/doc/${encodeURIComponent(id)}`} className="text-signal">open the file ›</Link>
          </div>
        </div>
      ) : (
        <div ref={root} data-scroll className="h-full snap-y snap-mandatory overflow-y-auto">
          {shorts!.map((s, i) => {
            const idx = shorts!.findIndex((x) => x.id === id);
            const title = docTitleParts(s.id, s.title, "video").title;
            return (
              <section key={s.id} id={`short-${s.id}`} className="relative flex h-[100dvh] snap-start items-center justify-center">
                <video
                  data-testid="short-video"
                  data-id={s.id}
                  src={s.clip}
                  poster={s.thumb ?? undefined}
                  muted={muted}
                  loop
                  playsInline
                  preload={i === idx || i === idx + 1 ? "metadata" : "none"}
                  onClick={() => setMuted((m) => !m)}
                  className="aspect-[9/16] h-full max-w-full object-contain"
                />
                <button type="button" onClick={() => setMuted((m) => !m)} aria-label={muted ? "Unmute" : "Mute"}
                  className="absolute right-3 top-3 rounded-full bg-black/50 px-3 py-1.5 text-[15px] text-white">
                  {muted ? "🔇" : "🔊"}
                </button>
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-10 text-white">
                  <div className="font-mono text-[10px] uppercase tracking-[.8px] text-white/60">{s.id}</div>
                  <div className="mb-3 line-clamp-2 text-[14px] font-semibold">{title}</div>
                  <div className="flex gap-2">
                    <Link to={`/doc/${encodeURIComponent(s.id)}`} className="rounded-full bg-white px-3.5 py-1.5 font-mono text-[11px] text-black">
                      View file ›
                    </Link>
                    <button type="button"
                      onClick={async () => setCopied((await shareLink(title, path(s.id, ""))) === "copied" ? s.id : "")}
                      className="rounded-full border border-white/40 px-3.5 py-1.5 font-mono text-[11px]">
                      {copied === s.id ? "Link copied" : "Share"}
                    </button>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

Router: add the route line from **Files**.

- [ ] **Step 4: Run** `cd web && npx vitest run src/tests/shorts.test.tsx` — Expected: PASS. If `getElementById` misses an id with a space: it doesn't (ids allow spaces in `getElementById`).

- [ ] **Step 5: Commit**

```bash
git add web/src/screens/Shorts.tsx web/src/router.tsx web/src/tests/shorts.test.tsx
git commit -m "feat(shorts): full-screen Shorts player at /shorts/:id"
```

### Task 5: Shorts strip in archive search

**Files:**
- Modify: `web/src/screens/Archive.tsx`
- Test: `web/src/tests/archive.test.tsx`

**Interfaces:** Consumes `useShorts`, `ShortsRow`, `shortHref` (Task 3).

- [ ] **Step 1: Write the failing test** — in `web/src/tests/archive.test.tsx` add `const useShortsMock = vi.fn(() => ({ data: [] as unknown[] }));` above the `vi.mock`, add `useShorts: (q: string, o?: { enabled?: boolean }) => useShortsMock(q, o),` inside it, and:

```tsx
describe("Archive Shorts strip", () => {
  it("shows matching Shorts above results when searching, linking to the player with q", async () => {
    useRecordsMock.mockImplementation(records);
    useShortsMock.mockImplementation(((q: string) => ({
      data: q ? [{ id: "DOW-UAP-PR104", title: "Two stars", thumb: null, clip: "https://c/x.mp4", showcase: true }] : [],
    })) as any);
    renderAppAt("/archive?q=star");
    expect(await screen.findByRole("heading", { name: /shorts \(1\)/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /two stars/i })).toHaveAttribute("href", "/shorts/DOW-UAP-PR104?q=star");
  });

  it("no strip without a search", async () => {
    useRecordsMock.mockImplementation(records);
    renderAppAt("/archive");
    await screen.findAllByText(/records/i);
    expect(screen.queryByRole("heading", { name: /shorts/i })).not.toBeInTheDocument();
    expect(useShortsMock).toHaveBeenCalledWith("", { enabled: false });
  });
});
```

- [ ] **Step 2: Run** `cd web && npx vitest run src/tests/archive.test.tsx` — Expected: FAIL (no heading).

- [ ] **Step 3: Implement** — `Archive.tsx`: import `useShorts` alongside `useRecords`, and `ShortsRow, shortHref` from `../components/ShortsRow`. After the `useRecords(...)` call:

```tsx
  // Searching: matching Shorts (title/summary/page text or the posted Short's
  // text) as a strip above the files; tap → the player, queue = this search.
  const { data: shorts = [] } = useShorts(q, { enabled: !!q });
```

In the `isLoading ? … : <>` branch, before the result-count div:

```tsx
          {q && page === 1 && shorts.length > 0 && (
            <section aria-labelledby="archive-shorts" className="mb-[18px]">
              <h2 id="archive-shorts" className="mx-0.5 mb-3 font-pixel text-[9px] font-normal uppercase tracking-[1px] text-faint">
                ◆ Shorts ({shorts.length})
              </h2>
              <ShortsRow shorts={shorts} href={(s) => shortHref(s, q)} />
            </section>
          )}
```

- [ ] **Step 4: Run** `cd web && npx vitest run src/tests/archive.test.tsx` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/screens/Archive.tsx web/src/tests/archive.test.tsx
git commit -m "feat(shorts): Shorts strip on archive search"
```

### Task 6: Full suites, browser check, deploy

- [ ] **Step 1:** `npx vitest run --config worker/vitest.config.ts` and `cd web && npx vitest run && npx tsc -b --noEmit` — all green (gate on exit codes, not grep).
- [ ] **Step 2:** Local preview (`preview_start` dev server from `.claude/launch.json`): home row tap → player opens on that Short, swipe/scroll changes URL, sound toggle, View file → doc; `/archive?q=star` shows strip; mobile viewport (375×812) has no horizontal scroll and the overlay sits above the bottom nav.
- [ ] **Step 3:** Deploy per Global Constraints (clean worktree of HEAD, `.dev.vars`, `pnpm install` root + web, tests, `pnpm run deploy`), then `git push`.
- [ ] **Step 4:** Verify live: `curl -s 'https://realufo.org/api/shorts?q=star'` returns the PR104/PR038 Short; `curl -s -H 'accept: text/html' https://realufo.org/shorts/DOW-UAP-PR104 | grep canonical` shows `/doc/DOW-UAP-PR104`.
