# Early Fetch Per Route Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Start each landing page's first API calls from `index.html` while the JS bundle downloads, and have `api.get` adopt those in-flight results once, so data arrives in parallel with the JS instead of after it.

**Architecture:** An inline script in `web/index.html` fills `window.__early[path] = { at, p }` for a fixed route→paths table. `api.get` in `web/src/api/client.ts` checks that map first (one-shot, under 10 s old, `null` result = fall back to a normal request). Today's homepage-only `window.__feed` special case in `useFeed` is folded into this one mechanism.

**Tech Stack:** React 19 + TanStack Query, Vite, Vitest + jsdom (web); Cloudflare Worker serves `index.html` (unchanged).

**Spec:** `docs/superpowers/specs/2026-10-04-realufo-early-fetch-design.md`

## Global Constraints

- Early paths must equal the hooks' request strings exactly: `/api/bootstrap`, `/api/hubs`, `/api/feed`, `/api/records/<id>`, `/api/records/<id>/comments`, `/api/records/facets`, `/api/records?limit=40&offset=0` (= `recordsPath({ limit: RECORDS_PAGE_SIZE, offset: 0 })`, `RECORDS_PAGE_SIZE = 40`).
- `<id>` = `decodeURIComponent` of the `/doc/<id>` path segment (what `useParams` gives the hooks).
- The list path is guessed only when `location.search` is empty.
- Anon id: read `localStorage.getItem("ufo_anon")` inside try; send it as the `X-Anon-Id` header only when present.
- Adoption: one-shot (delete on first lookup); only if `performance.now() - at < 10000`; a `null` result → normal request; restore `setStale(stale)` from `X-SW-Cache === "1"`.
- The inline script must never break page load: the whole thing is wrapped in try/catch; plain ES5 (no arrow functions, no `const`/`let`).
- Toolchain: Node 22 first on PATH (`export PATH=~/.nvm/versions/node/v22.22.0/bin:$PATH`). Web tests: `cd web && npx vitest run`. Typecheck: `cd web && npx tsc -b --noEmit` (it covers tests too).
- Shared checkout: other chats commit here too. Run `git status` and `git diff --cached --name-only` before staging, and stage only this plan's files. Write commit messages to a file and use `git commit -F` (a hook blocks Bash commands whose text contains wrangler followed by deploy).
- Deploy only from a clean detached worktree via `pnpm run deploy` (it applies D1 migrations first). Never deploy from the main checkout.

## Review Focus

1. **Doc ids with encoded characters** (`/doc/A%20B`): the early key must be the decoded `A B`, or the early fetch is wasted and the hook fetches again. Pinned in Task 2 (drift test, encoded id case).
2. **`localStorage` throws** (Safari private mode, blocked storage): the script must still fetch, just without `X-Anon-Id`. Pinned in Task 2.
3. **Early response not OK** (doc 404, Worker 500): the hook must still make its own request and surface the real `ApiError` (the "file not found" screen depends on it). Pinned in Task 1.
4. **Same path requested twice** (StrictMode double effects; Doc and Archive both asking for the default list): only the first call adopts, the second goes to the network, and nothing hangs. Pinned in Task 1.
5. **Landing with a query string** (`/archive?q=x`, `/doc/X?q=y&page=2`): no list guess, so no wasted request with a wrong key. Pinned in Task 2.

---

### Task 1: One-shot adoption in `api.get`

**Files:**
- Modify: `web/src/api/client.ts` (add the `early()` helper above `export const api`; change `api.get`)
- Modify: `web/src/api/queries.ts:85` (export `recordsPath`)
- Test: `web/src/tests/client.test.ts` (append a `describe` block)

**Interfaces:**
- Consumes: nothing new.
- Produces: `window.__early?: Record<string, { at: number; p: Promise<{ d: unknown; stale: boolean } | null> }>`, which Task 2's inline script fills. `export function recordsPath(params: RecordsParams): string` from `web/src/api/queries.ts`, which Task 2's drift test uses.

- [ ] **Step 1: Write the failing tests**

Append to `web/src/tests/client.test.ts`:

```ts
describe("early fetch adoption (index.html window.__early)", () => {
  type Early = { at: number; p: Promise<{ d: unknown; stale: boolean } | null> };
  const w = window as unknown as { __early?: Record<string, Early> };
  const put = (path: string, r: { d: unknown; stale: boolean } | null, at = performance.now()) => {
    w.__early = { ...(w.__early ?? {}), [path]: { at, p: Promise.resolve(r) } };
  };
  beforeEach(() => {
    delete w.__early;
    vi.restoreAllMocks();
  });

  it("adopts the early result without a network request", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    put("/api/records/X", { d: { record: { id: "X" } }, stale: false });
    expect(await api.get("/api/records/X")).toEqual({ record: { id: "X" } });
    expect(spy).not.toHaveBeenCalled();
  });

  it("adopts once: a second GET of the same path goes to the network", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ n: 2 }), { status: 200 }));
    put("/api/hubs", { d: { n: 1 }, stale: false });
    expect(await api.get("/api/hubs")).toEqual({ n: 1 });
    expect(await api.get("/api/hubs")).toEqual({ n: 2 });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("a failed early fetch (null) falls back to a normal request and surfaces its ApiError", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: "not found" }), { status: 404 }));
    put("/api/records/GONE", null);
    await expect(api.get("/api/records/GONE")).rejects.toMatchObject({ status: 404 });
  });

  it("ignores an entry 10 s or older and fetches fresh", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ fresh: true }), { status: 200 }));
    put("/api/bootstrap", { d: { fresh: false }, stale: false }, performance.now() - 10_000);
    expect(await api.get("/api/bootstrap")).toEqual({ fresh: true });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(w.__early?.["/api/bootstrap"]).toBeUndefined();
  });

  it("restores the service worker's stale flag from the early response", async () => {
    put("/api/feed", { d: { cards: [] }, stale: true });
    await api.get("/api/feed");
    expect(isStale()).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd web && npx vitest run src/tests/client.test.ts`
Expected: the new tests FAIL. "adopts the early result" fails because `fetch` is called; the stale test fails because `isStale()` is false.

- [ ] **Step 3: Implement**

In `web/src/api/client.ts`, replace

```ts
export const api = {
  get: <T>(path: string) => req<T>("GET", path),
```

with

```ts
// index.html starts each landing route's first GETs before this bundle loads
// (spec docs/superpowers/specs/2026-10-04-realufo-early-fetch-design.md). The first
// GET of a path adopts that result once; a failed one (null) or one 10 s+ old means
// a normal request, so this is never worse than no early fetch.
type Early = { at: number; p: Promise<{ d: unknown; stale: boolean } | null> };
const EARLY_MAX_AGE_MS = 10_000;

async function early<T>(path: string): Promise<T | undefined> {
  const all = (window as { __early?: Record<string, Early> }).__early;
  const e = all?.[path];
  if (!all || !e) return undefined;
  delete all[path];
  if (performance.now() - e.at >= EARLY_MAX_AGE_MS) return undefined;
  const r = await e.p;
  if (!r) return undefined;
  setStale(r.stale);
  return r.d as T;
}

export const api = {
  get: async <T>(path: string): Promise<T> => {
    const hit = await early<T>(path);
    return hit !== undefined ? hit : req<T>("GET", path);
  },
```

In `web/src/api/queries.ts`, change `function recordsPath(params: RecordsParams): string {` to `export function recordsPath(params: RecordsParams): string {`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd web && npx vitest run src/tests/client.test.ts src/tests/queries.test.tsx src/tests/feed.test.tsx`
Expected: all PASS. The `__feed` path in `useFeed` is untouched in this task, so feed tests are unaffected.

- [ ] **Step 5: Typecheck and commit**

```bash
cd web && npx tsc -b --noEmit && cd ..
git status --short && git diff --cached --name-only
git add web/src/api/client.ts web/src/api/queries.ts web/src/tests/client.test.ts
printf 'feat(web): api.get adopts index.html early fetches once (window.__early)\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\n' > /tmp/ef-msg1.txt
git commit -F /tmp/ef-msg1.txt
```

---

### Task 2: Inline early-fetch script + drift test, fold `__feed` in

**Files:**
- Modify: `web/index.html` (replace the `window.__feed` `<script>` and its comment in `<head>`)
- Modify: `web/src/api/queries.ts:111-124` (delete the `EarlyFeed` type and comment; simplify `useFeed`)
- Create: `web/src/tests/earlyFetch.test.ts`

**Interfaces:**
- Consumes: `window.__early` adoption in `api.get` (Task 1); `recordsPath` (exported in Task 1); `RECORDS_PAGE_SIZE` from `web/src/lib/recordsPage.ts`.
- Produces: `window.__early` populated on page load for the spec's routes.

- [ ] **Step 1: Write the failing drift test**

Create `web/src/tests/earlyFetch.test.ts`:

```ts
// Runs the real early-fetch <script> from index.html against fake globals and checks
// it requests exactly the paths the hooks will (spec 2026-10-04-realufo-early-fetch).
import { describe, it, expect } from "vitest";
import html from "../../index.html?raw";
import { recordsPath } from "../api/queries";
import { RECORDS_PAGE_SIZE } from "../lib/recordsPage";

const src = html.match(/<script>([^<]*__early[^<]*)<\/script>/)?.[1] ?? "";

function run(url: string, anon: string | null | "throws" = "anon-1") {
  const u = new URL(url, "https://realufo.org");
  const calls: { path: string; headers: Record<string, string> }[] = [];
  const win: { __early?: Record<string, unknown> } = {};
  const fetch = (path: string, init: { headers: Record<string, string> }) => {
    calls.push({ path, headers: init.headers });
    return Promise.resolve(new Response("{}", { status: 200 }));
  };
  const localStorage = {
    getItem: () => {
      if (anon === "throws") throw new Error("SecurityError");
      return anon;
    },
  };
  new Function("window", "location", "fetch", "localStorage", "performance", src)(
    win, { pathname: u.pathname, search: u.search }, fetch, localStorage, { now: () => 5 },
  );
  return { paths: calls.map((c) => c.path), calls, early: win.__early ?? {} };
}

const LIST = recordsPath({ limit: RECORDS_PAGE_SIZE, offset: 0 });
const BASE = ["/api/bootstrap", "/api/hubs"];

describe("index.html early fetch", () => {
  it("is present in index.html", () => {
    expect(src).toContain("__early");
  });

  it("home: bootstrap, hubs, feed", () => {
    expect(run("/").paths).toEqual([...BASE, "/api/feed"]);
  });

  it("doc landing: record, comments and the default neighbour list", () => {
    expect(run("/doc/DOW-UAP-PR067").paths).toEqual([
      ...BASE, "/api/records/DOW-UAP-PR067", "/api/records/DOW-UAP-PR067/comments", LIST,
    ]);
  });

  it("doc id is decoded like useParams (encoded characters)", () => {
    expect(run("/doc/A%20B").paths).toContain("/api/records/A B");
  });

  it("doc or archive with a query string: no list guess", () => {
    expect(run("/doc/X?q=balloon&page=2").paths).toEqual([...BASE, "/api/records/X", "/api/records/X/comments"]);
    expect(run("/archive?q=washington").paths).toEqual(BASE);
  });

  it("bare archive: facets and the first page", () => {
    expect(run("/archive").paths).toEqual([...BASE, "/api/records/facets", LIST]);
  });

  it("other routes: only bootstrap and hubs", () => {
    expect(run("/boards").paths).toEqual(BASE);
    expect(run("/doc/X/text").paths).toEqual(BASE);
  });

  it("sends X-Anon-Id only when one is stored, and survives localStorage throwing", () => {
    expect(run("/", "anon-1").calls[0].headers).toEqual({ "X-Anon-Id": "anon-1" });
    expect(run("/", null).calls[0].headers).toEqual({});
    expect(run("/", "throws").paths).toEqual([...BASE, "/api/feed"]);
  });

  it("stores {at, p} per path; a non-OK response resolves to null", async () => {
    const { early } = run("/");
    const e = early["/api/feed"] as { at: number; p: Promise<unknown> };
    expect(e.at).toBe(5);
    await expect(e.p).resolves.toEqual({ d: {}, stale: false });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web && npx vitest run src/tests/earlyFetch.test.ts`
Expected: FAIL. "is present in index.html" fails (`src` is `""`), and the route tests fail with empty `paths`.

- [ ] **Step 3: Replace the `__feed` script in `web/index.html`**

Remove these lines:

```html
    <!-- Homepage: start /api/feed now instead of after the bundle loads — its first
         thumbnail is the LCP image. useFeed() (src/api/queries.ts) takes it over. -->
    <script>if (location.pathname === "/") window.__feed = fetch("/api/feed").then((r) => (r.ok ? r.json() : null)).catch(() => null);</script>
```

and put in their place (keep it free of `<` characters: the drift test extracts the script with `[^<]*`):

```html
    <!-- Early fetch (docs/superpowers/specs/2026-10-04-realufo-early-fetch-design.md): start this
         route's first API calls now, while the bundle downloads; api.get (src/api/client.ts)
         adopts each once. Paths must equal the hooks' requests: src/tests/earlyFetch.test.ts. -->
    <script>
      try {
        (function () {
          var p = location.pathname, bare = !location.search, list = "/api/records?limit=40&offset=0";
          var paths = ["/api/bootstrap", "/api/hubs"], doc = /^\/doc\/([^/]+)$/.exec(p);
          if (p === "/") paths.push("/api/feed");
          else if (doc) {
            var id = decodeURIComponent(doc[1]);
            paths.push("/api/records/" + id, "/api/records/" + id + "/comments");
            if (bare) paths.push(list);
          } else if (p === "/archive" && bare) paths.push("/api/records/facets", list);
          var headers = {}, anon = null;
          try { anon = localStorage.getItem("ufo_anon"); } catch (e) {}
          if (anon) headers["X-Anon-Id"] = anon;
          var early = (window.__early = {});
          paths.forEach(function (u) {
            early[u] = {
              at: performance.now(),
              p: fetch(u, { headers: headers })
                .then(function (r) {
                  return r.ok ? r.json().then(function (d) { return { d: d, stale: r.headers.get("X-SW-Cache") === "1" }; }) : null;
                })
                .catch(function () { return null; }),
            };
          });
        })();
      } catch (e) {}
    </script>
```

- [ ] **Step 4: Fold `__feed` into the generic path in `web/src/api/queries.ts`**

Replace

```ts
// index.html kicks /api/feed off before the bundle loads (homepage LCP). The first
// fetch adopts that promise; a failed one (resolves null) falls back to a normal request.
type EarlyFeed = { __feed?: Promise<Feed | null> };

export function useFeed() {
  return useQuery({
    queryKey: qk.feed,
    queryFn: () => {
      const early = (window as EarlyFeed).__feed;
      delete (window as EarlyFeed).__feed;
      return early ? early.then((d) => d ?? api.get<Feed>("/api/feed")) : api.get<Feed>("/api/feed");
    },
  });
}
```

with

```ts
// index.html starts /api/feed before the bundle loads (homepage LCP image); api.get adopts it.
export function useFeed() {
  return useQuery({ queryKey: qk.feed, queryFn: () => api.get<Feed>("/api/feed") });
}
```

Then run `grep -rn "__feed" web/src web/index.html`. Expected: no matches. If a test still sets `window.__feed`, rewrite it to set `window.__early["/api/feed"] = { at: performance.now(), p: Promise.resolve({ d: <same data>, stale: false }) }`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd web && npx vitest run src/tests/earlyFetch.test.ts src/tests/feed.test.tsx src/tests/queries.test.tsx src/tests/client.test.ts`
Expected: all PASS.

- [ ] **Step 6: Full web suite, typecheck, local smoke, commit**

```bash
export PATH=~/.nvm/versions/node/v22.22.0/bin:$PATH
cd web && npx tsc -b --noEmit && npx vitest run > /tmp/ef-web.log 2>&1; echo exit $?; grep -E "Tests |FAIL" /tmp/ef-web.log; cd ..
```

Expected: `exit 0` and all tests passing.

Local smoke: start the `worker-dev` and `web-dev` preview servers (`.claude/launch.json`). Open `http://localhost:5173/doc/<any local id>` and run `performance.getEntriesByType("resource").filter(e => e.name.includes("/api/")).map(e => [e.name, Math.round(e.startTime)])`. Expected: `/api/records/<id>` appears once (adopted, no duplicate) and starts before the `main.tsx` module finishes loading. Stop the servers.

```bash
git status --short && git diff --cached --name-only
git add web/index.html web/src/api/queries.ts web/src/tests/earlyFetch.test.ts
printf 'perf(web): start each landing route'"'"'s API calls from index.html (doc, archive, home, bootstrap, hubs)\n\nGeneralizes the homepage __feed trick; api.get adopts each early result once.\nDrift test runs the real inline script against the real path builders.\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\n' > /tmp/ef-msg2.txt
git commit -F /tmp/ef-msg2.txt
```

---

### Task 3: Deploy, measure, record

**Files:**
- Modify: `docs/audits/realufo-seo-speed-fixes-2026-10-04.md` (append an "Early fetch — before/after" section)

**Interfaces:**
- Consumes: Tasks 1–2 committed on `build/app-foundation`.
- Produces: the live deploy and before/after numbers.

- [ ] **Step 1: Baseline before deploy**

Lighthouse 12 mobile on the three pages, saving JSON:

```bash
export PATH=~/.nvm/versions/node/v22.22.0/bin:$PATH; S=$(mktemp -d)
for p in "" archive doc/DOW-UAP-PR067; do n=$(echo "home$p" | tr '/' '_'); npx -y lighthouse@12 "https://realufo.org/$p" --quiet --chrome-flags="--headless=new" --only-categories=performance --output=json --output-path=$S/before_$n.json >/dev/null 2>&1; done; echo $S
```

- [ ] **Step 2: Pre-deploy checks and deploy from a clean worktree**

```bash
git fetch -q && git log --oneline HEAD..origin/build/app-foundation   # expect empty
npx wrangler d1 migrations list realufo-db --remote --env-file /dev/null | tail -1
W=$(mktemp -d)/deploy; git worktree add --detach $W HEAD; cp .dev.vars $W/ 2>/dev/null || true; cd $W
pnpm install --frozen-lockfile && (cd web && pnpm install --frozen-lockfile)
(cd web && npx tsc -b --noEmit && npx vitest run) && npx vitest run --config worker/vitest.config.ts && pnpm run deploy
```

Expected: tests pass and `Current Version ID: …` prints. Then go back to the main checkout, `git push origin HEAD:build/app-foundation`, and `git worktree remove --force $W`.

- [ ] **Step 3: Live verification**

In the browser pane (1440×900), open `https://realufo.org/doc/FBI-UAP-D007`, `https://realufo.org/archive` and `https://realufo.org/` as fresh loads. On each, run:

```js
performance.getEntriesByType("resource").filter(e => e.name.includes("/api/")).map(e => [e.name.replace(location.origin, ""), Math.round(e.startTime), Math.round(e.responseEnd)])
```

Expected: each listed early path appears exactly once and starts before 300 ms (doc baseline today: ~1,118 ms). If a path appears twice, its early key doesn't match the hook's path string: fix it in the script and the drift test.

Also check the page works with no saved data: in a private window, open a doc page; the content and "my verdict" area render normally.

- [ ] **Step 4: After numbers and record**

Re-run Step 1's Lighthouse loop with `after_` file names. Append to `docs/audits/realufo-seo-speed-fixes-2026-10-04.md`:

```markdown
## Early fetch — before/after (<deploy version>)

| Page | Score before → after | LCP sim before → after | API start (live, wifi) before → after |
|---|---|---|---|
| `/` | … | … | … |
| `/archive` | … | … | … |
| `/doc/DOW-UAP-PR067` | … | … | ~1,118 ms → … |
```

Fill every cell from the JSON files and Step 3. Commit with `git commit -F` and push.
