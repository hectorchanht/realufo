# Plan 008: Cold cases get an index page (`/cases`), entry points, all their threads, and a back-link from threads

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 218df89..HEAD -- worker/routes/cases.ts worker/routes/threads.ts worker/routes/bootstrap.ts worker/lib/pages.ts worker/routes/sitemap.ts worker/routes/llms.ts web/src/router.tsx web/src/api/types.ts web/src/screens/Case.tsx web/src/screens/Thread.tsx web/src/screens/Feed.tsx web/src/components/SiteFooter.tsx`
> Plans 003/004/005/007 touch router.tsx, Thread.tsx, Feed.tsx; those changes are expected. Anything else → compare against "Current state"; on mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none hard; run after 003–007 to avoid merge churn in shared files
- **Category**: direction (product request from the maintainer)
- **Planned at**: commit `218df89`, 2026-10-02

## Why this matters

realufo.org has 12 hand-written "cold case" pages (`/case/:slug`, e.g. Roswell, Kaikoura, JAL 1628) — a product pillar in the original brief — but there is no list of them; the only way in is a 9-px pin on the map. A case shows only ONE linked discussion thread (arbitrary, `LIMIT 1` with no ORDER BY), and a thread started from a case has no link back to the case (threads started from a record do). After this plan: a `/cases` index (also crawlable), links to it from the feed and footer, every case lists all its threads (newest first), and case threads show a "◂ from cold case" chip.

## Current state

**Worker (Cloudflare Worker + D1, tests via `pnpm test:worker`, seeded DB in `worker/tests/helpers.ts`):**
- `worker/routes/cases.ts:5-14`:
  ```ts
  export async function getCase(_req: Request, env: Env, p: Record<string, string>) {
    const c = await env.DB.prepare("SELECT * FROM cases WHERE slug=?").bind(p.slug).first();
    if (!c) return error(404, "case not found");
    const t = await env.DB.prepare(
      `SELECT t.id,t.title,b.slug boardSlug,b.accent accent,t.created_at FROM threads t JOIN boards b ON b.id=t.board_id WHERE t.case_slug=? LIMIT 1`
    ).bind(p.slug).first<any>();
    return json({ case: c, relatedThread: t ? { ...t, ago: relAgo(t.created_at) } : null });
  }
  ```
- `worker/routes/threads.ts:8-35` `getThread` — selects `t.*` (includes `case_slug`), looks up `sourceRecord` when `thread.source_record_id`, returns `json({ thread, sourceRecord, posts })`.
- `worker/routes/bootstrap.ts:44` — `env.DB.prepare("SELECT slug,name,accent,coord FROM cases").all()` → `cases` in the bootstrap JSON (line 111).
- `cases` table: `slug, name, archive, archive_label, accent, coord, lede, pull, pull_cite, status` (`db/schema.sql:3`).
- Crawler HTML: `worker/lib/pages.ts:284-299` `ROUTES` table maps paths to loaders; unknown paths get a real 404 (`worker/lib/meta.ts:81-86`), so **`/cases` must be registered** or crawlers get 404. Exemplar loader `boardsPage` (`pages.ts:89-96`) using `section(...)` and `tabBody(...)` from `worker/lib/ssr.ts`; `TAB` meta objects at `pages.ts:38-50`; `caseHref`-style helpers: case pages are `/case/${slug}`.
- `worker/routes/sitemap.ts:49` — static paths `["/", "/archive", "/boards", "/map", "/browse"]`.
- `worker/routes/llms.ts:39-42` — "Main pages" `link(name, path, note?)` lines.
- Tests: `worker/tests/cases.spec.ts` (kaikoura has seeded thread `t5` on board `/cases/`), `worker/tests/threads.spec.ts`, `worker/tests/bootstrap.spec.ts:23`, `worker/tests/sitemap.spec.ts`, `worker/tests/meta.spec.ts`.

**Web (`web/src`, React + react-router v7 + TanStack Query):**
- `web/src/api/types.ts`: `CaseLite { slug; name; accent; coord }` (`:84-89`); `RelatedThread { id; title; boardSlug; accent; ago }` (`:437-443`); `CaseDetail { case: Case; relatedThread: RelatedThread | null }` (`:445-448`); `ThreadDetail { thread; sourceRecord; posts }` (`:372-376`).
- `web/src/screens/Case.tsx:41,105-130` renders one "ACTIVE DISCUSSION" card from `relatedThread`.
- `web/src/screens/Thread.tsx:257-277` — "◂ from record" chip markup (copy its look for the case chip).
- `web/src/router.tsx` — lazy routes via `screen(() => import("./screens/X"))`; `/case/:slug` exists.
- `web/src/screens/Feed.tsx` — sections with headers like `<div className="mx-0.5 mb-3 font-pixel text-[9px] uppercase tracking-[1px] text-faint">◆ Trending threads</div>` and a `see all ›`/`all boards ›` link (`:114-119`); `BrowseStrip` (`:40-76`) is a chip-row exemplar.
- `web/src/components/SiteFooter.tsx` — "Explore" column built from `nav` items + extra `<li>` links (`linkCls`).
- `web/src/components/navItems.ts` — `activeTabForPath("/cases")` already returns `"feed"` (`startsWith("/case")`); `canBackForPath("/cases")` is true (back chevron shows) — fine.
- Bootstrap hook: `useBootstrap()` in `web/src/api/queries.ts`. Page titles: `useSetPageTitle(title, sub)`.
- Tests: `web/src/tests/case.test.tsx` (fixtures with `relatedThread`), `web/src/tests/feed.test.tsx`, `web/src/tests/thread.test.tsx`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Worker tests | `pnpm test:worker` (repo root) | all pass (356 at plan time + new) |
| Worker typecheck | `npx tsc -p tsconfig.json --noEmit` (repo root) | exit 0 |
| Web tests | `cd web && NODE_OPTIONS=--no-experimental-webstorage npx vitest run` | all pass |
| Web typecheck | `cd web && npx tsc -b` | exit 0 |

## Scope

**In scope**:
- Worker: `worker/routes/cases.ts`, `worker/routes/threads.ts` (`getThread` only), `worker/routes/bootstrap.ts` (cases select only), `worker/lib/pages.ts`, `worker/routes/sitemap.ts`, `worker/routes/llms.ts`, matching `worker/tests/*.spec.ts`
- Web: `web/src/api/types.ts`, `web/src/router.tsx`, `web/src/screens/Cases.tsx` (create), `web/src/screens/Case.tsx`, `web/src/screens/Thread.tsx` (chip only), `web/src/screens/Feed.tsx`, `web/src/components/SiteFooter.tsx`, `web/src/tests/cases.test.tsx` (create), `case.test.tsx`, `thread.test.tsx`

**Out of scope**: D1 migrations (no schema change needed), the map, case comments, `worker/routes/feed.ts`.

## Git workflow

- Worktree branch `advisor/008-cold-cases`; one commit per step group; conventional commits (`feat(cases): …`); do NOT push, deploy or run remote D1 commands.

## Steps

### Step 1: API — all threads per case

In `getCase`, replace the single-thread query with:
```ts
const { results } = await env.DB.prepare(
  `SELECT t.id,t.title,b.slug boardSlug,b.accent accent,t.reply_count replies,t.created_at
   FROM threads t JOIN boards b ON b.id=t.board_id WHERE t.case_slug=? ORDER BY t.created_at DESC LIMIT 20`
).bind(p.slug).all<any>();
const threads = results.map((t) => ({ ...t, ago: relAgo(t.created_at) }));
return json({ case: c, threads, relatedThread: threads[0] ?? null });
```
(`relatedThread` stays for compatibility.) Add to `worker/tests/cases.spec.ts`: kaikoura returns `threads` array, length ≥ 1, `threads[0].id === "t5"`, `threads[0]` has `replies` and `ago`.

**Verify**: `pnpm test:worker` → all pass.

### Step 2: API — case back-link on threads

In `getThread`, alongside `sourceRecord`:
```ts
const sourceCase = thread.case_slug
  ? await env.DB.prepare("SELECT slug,name,accent FROM cases WHERE slug=?").bind(thread.case_slug).first()
  : null;
```
and return `json({ thread, sourceRecord, sourceCase, posts })`. Add a test in `worker/tests/threads.spec.ts`: GET `/api/threads/t5` → `sourceCase.slug === "kaikoura"`; a thread without `case_slug` → `sourceCase === null` (find one in the seed, e.g. the thread used by "thread detail returns source record chip when promoted").

**Verify**: `pnpm test:worker` → all pass.

### Step 3: Bootstrap — short lede for the index

`bootstrap.ts:44`: `SELECT slug,name,accent,coord,substr(coalesce(lede,''),1,160) lede FROM cases ORDER BY name`. Extend `bootstrap.spec.ts:23` area: `expect(b.cases[0]).toHaveProperty("lede")`.

**Verify**: `pnpm test:worker` → all pass; `npx tsc -p tsconfig.json --noEmit` → exit 0.

### Step 4: Crawler page, sitemap, llms.txt

- `pages.ts`: add `TAB.cases = { title: "Cold Cases", description: "Famous UAP cases, what the official record says, and where to discuss them.", type: "website" as const }` and a loader modelled on `boardsPage`:
  ```ts
  const casesPage: Loader = async (env) => {
    const { results } = await env.DB.prepare("SELECT slug,name,lede FROM cases ORDER BY name").all<{ slug: string; name: string; lede: string | null }>();
    const t = TAB.cases;
    const links = results.map((c) => ({ href: `/case/${encodeURIComponent(c.slug)}`, text: c.lede ? `${c.name} — ${c.lede.slice(0, 140)}` : c.name }));
    return { meta: t, body: tabBody(t.title, t.description, section("Cases", links)) };
  };
  ```
  Register `{ pattern: new URLPattern({ pathname: "/cases" }), load: casesPage }` in `ROUTES` (before `/case/:slug`).
- `sitemap.ts:49`: add `"/cases"`.
- `llms.ts`: add `link("Cold cases", "/cases", "famous cases and their records")` after "Sighting map".
- Tests: in `worker/tests/meta.spec.ts` (follow how it requests `/boards`) assert `/cases` returns 200 HTML containing "Cold Cases" and a `/case/kaikoura` link; in `sitemap.spec.ts` assert the XML contains `/cases</loc>`.

**Verify**: `pnpm test:worker` → all pass.

### Step 5: Web types

`types.ts`: `CaseLite` add `lede?: string`; add `export interface CaseThread extends RelatedThread { replies: number }`; `CaseDetail` add `threads?: CaseThread[]`; `ThreadDetail` add `sourceCase?: { slug: string; name: string; accent: string } | null`.

**Verify**: `cd web && npx tsc -b` → exit 0.

### Step 6: `/cases` screen + route

Create `web/src/screens/Cases.tsx` (default export): `useSetPageTitle("COLD CASES", "Famous cases and the files behind them")`; read `useBootstrap().data?.cases ?? []`; while bootstrap loads show `◉ loading signal…` (same classes as other screens); render `<div data-screen="cases">` with one `<Link to={`/case/${c.slug}`}>` card per case: left border `style={{ borderLeftColor: c.accent }}`, name (`text-[15px] font-bold text-ink`), coord (`font-mono text-[10px] text-faint`), lede (`text-[13px] text-dim`). Card classes: `rounded-[14px] border border-line border-l-4 bg-surface px-[14px] py-3 hover:border-line2`.
Router: add `{ path: "/cases", lazy: screen(() => import("./screens/Cases")) }` next to `/case/:slug`.

### Step 7: Entry points

- `Feed.tsx`: after `<BrowseStrip />`, a section with header `◆ Cold cases` + `<Link to="/cases" className="font-mono text-[11px] text-signal">see all ›</Link>` (copy the Trending threads header markup) and a chip row of the first 6 `boot?.cases` (copy `BrowseStrip`'s chip classes), each linking to `/case/${slug}`; render nothing when there are no cases.
- `SiteFooter.tsx` "Explore" column: add `<li key="cases"><Link className={linkCls} to="/cases">Cold cases</Link></li>` after "Browse all".

### Step 8: Case page lists all threads; thread chip

- `Case.tsx`: `const threads = data?.threads ?? (relatedThread ? [relatedThread] : [])`; render one card per thread with the existing ACTIVE DISCUSSION card markup (keep the heading once, above the list). Keep the existing null case (no card when empty).
- `Thread.tsx`: when `data?.sourceCase`, render a chip right after the "◂ from record" chip, same markup but linking `/case/${sourceCase.slug}`, label `from cold case`, text `sourceCase.name`, no thumbnail, `data-case-chip`.

### Step 9: Web tests

- Create `web/src/tests/cases.test.tsx`: mock `useBootstrap` (pattern: `web/src/tests/components.test.tsx` mocks `../api/queries`) returning two cases; render `<Cases />` in a `MemoryRouter`; expect two links with `href="/case/<slug>"` and the lede text.
- `case.test.tsx`: add a fixture with `threads: [two items]` → both titles render.
- `thread.test.tsx`: fixture with `sourceCase: { slug: "roswell", name: "Roswell", accent: "#fff" }` → link `href="/case/roswell"` with text "Roswell".

**Verify**: web suite → all pass; `cd web && npx tsc -b` → exit 0; `pnpm test:worker` → all pass.

## Test plan

Worker: Steps 1–4 (4 new assertions groups). Web: Step 9 (3 new tests). Existing case/thread/feed tests must pass.

## Done criteria

- [ ] `pnpm test:worker` and the web suite pass; both typechecks exit 0
- [ ] `grep -n '"/cases"' web/src/router.tsx worker/lib/pages.ts worker/routes/sitemap.ts` → a match in each
- [ ] `grep -n "LIMIT 1" worker/routes/cases.ts` → no matches
- [ ] No files under `db/migrations/` added or changed
- [ ] `plans/README.md` row updated

## STOP conditions

- The seed has no thread with `case_slug` (Step 1/2 tests can't be written as described) — report the seed facts.
- `meta.spec.ts` has no pattern for requesting an HTML page — report instead of inventing a harness.
- Any step seems to need a D1 migration.

## Maintenance notes

- After deploy, the operator should ping IndexNow for `/cases` (`crawler/indexnow.py`), per project practice.
- Plan 004's `parentPath` maps `/case/` → `/map`; once this lands, change it to `/cases` (and `/cases` → `/`).
- Reviewer: open `/cases` on a phone; each card opens its case; a case with several threads lists them newest first; a case thread shows "◂ from cold case".
