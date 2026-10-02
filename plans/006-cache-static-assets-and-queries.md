# Plan 006: Long-cache hashed bundles and stop refetching stable data on every navigation

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 218df89..HEAD -- web/public web/src/main.tsx web/src/api/queries.ts web/src/api/queryClient.ts wrangler.jsonc`
> Plan 003 is expected to have created `web/src/api/queryClient.ts` and changed `main.tsx`; that is not drift. Any other change → compare against "Current state"; on mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/003-not-found-and-load-error-states.md (creates `queryClient.ts`)
- **Category**: perf
- **Planned at**: commit `218df89`, 2026-10-02

## Why this matters

1. realufo.org's JS/CSS/font files have content hashes in their names (`/assets/index-Z1eD6fQp.js`) but are served with the Workers Static Assets default `Cache-Control: public, max-age=0, must-revalidate` (verified live with `curl -sI`). Every repeat visit re-validates each file before rendering, which costs round trips on mobile.
2. TanStack Query runs with `staleTime: 0`, so every route change and every tab refocus refetches whatever the new screen mounts. `/api/bootstrap` is used by ~9 components; each call does one D1 write (presence upsert) and ~11 D1 reads including full-table aggregates (`worker/routes/bootstrap.ts:9-70`), for data that changes slowly.
After this plan: hashed assets cache for a year (`immutable`), queries are fresh for 30 s, and bootstrap for 5 min.

## Current state

- `wrangler.jsonc:6-10` — `"assets": { "directory": "web/dist", …, "run_worker_first": ["/*", "!/assets/*", "!/robots.txt"] }` → `/assets/*` is served directly by Workers Static Assets, so a `_headers` file applies to it. Vite copies `web/public/*` into `web/dist/` at build time. There is no `web/public/_headers` today (`web/public` holds favicon.svg, icons.svg, og.png, robots.txt, sw.js, and a verification .txt).
- Cloudflare docs (developers.cloudflare.com/workers/static-assets/headers/): a plain-text `_headers` file in the assets directory overrides default headers; it is NOT applied to responses produced by Worker code. Example from the docs:
  ```
  /static/*
    Cache-Control: public, max-age=31556952, immutable
  ```
- After plan 003, `web/src/api/queryClient.ts` contains:
  ```ts
  export function makeQueryClient(): QueryClient {
    return new QueryClient({ defaultOptions: { queries: { retry: shouldRetry } } });
  }
  ```
- `web/src/api/queries.ts:91-96`:
  ```ts
  export function useBootstrap() {
    return useQuery({
      queryKey: qk.bootstrap,
      queryFn: () => api.get<Bootstrap>("/api/bootstrap"),
    });
  }
  ```
- Mutations already invalidate what they change (`invalidateQueries` calls in queries.ts lines ~224-316) — invalidation refetches regardless of `staleTime`, so posting/commenting stays instant. Votes patch the cache directly.
- Presence ("online now") counts actors seen in the last 5 minutes and is refreshed by bootstrap calls; it is not displayed anywhere in the UI today.
- **Do not touch `worker/routes/feed.ts`** — a separately planned feature (docs/superpowers/plans/2026-10-02-realufo-verdicts-highlights.md) rewrites it.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Web tests | `cd web && NODE_OPTIONS=--no-experimental-webstorage npx vitest run` | all pass |
| Typecheck | `cd web && npx tsc -b` | exit 0 |
| Build | `cd web && npx vite build` | exit 0; writes `web/dist` (gitignored) |

## Scope

**In scope**: `web/public/_headers` (create), `web/src/api/queryClient.ts`, `web/src/api/queries.ts` (`useBootstrap` only), `web/src/tests/loadError.test.tsx` or a new `web/src/tests/queryClient.test.ts`

**Out of scope**: `worker/` (API JSON stays `no-store`; edge-caching API responses is a separate decision), `worker/routes/feed.ts`, `index.html`, `web/public/sw.js` (never edit or delete — it is a kill-switch for an old service worker).

## Git workflow

- Worktree branch `advisor/006-caching`; conventional commits (`perf: …`); do NOT push or deploy.

## Steps

### Step 1: `_headers`

Create `web/public/_headers` (exact content, two-space indent):
```
/assets/*
  Cache-Control: public, max-age=31536000, immutable
```
Do NOT add rules for `/`, `/index.html` or `/sw.js`.

**Verify**: `cd web && npx vite build && cat dist/_headers` → prints the two lines.

### Step 2: Query freshness

- `queryClient.ts`: `defaultOptions: { queries: { retry: shouldRetry, staleTime: 30_000 } }`.
- `useBootstrap`: add `staleTime: 5 * 60_000` to the `useQuery` options, with a one-line comment: "archives/boards/stats change slowly; also the presence heartbeat — 5 min matches its window".

### Step 3: Test

Add a test (new `web/src/tests/queryClient.test.ts`):
```ts
const qc = makeQueryClient();
expect(qc.getDefaultOptions().queries?.staleTime).toBe(30_000);
```

**Verify**: full web test command → all pass; `cd web && npx tsc -b` → exit 0.

## Test plan

Step 3. Behavioural check after deploy (operator, not executor): `curl -sI https://realufo.org/assets/<current index-*.js> | grep -i cache-control` → `public, max-age=31536000, immutable`; `curl -sI https://realufo.org/ | grep -i cache-control` → NOT immutable.

## Done criteria

- [ ] `web/public/_headers` exists with exactly the `/assets/*` rule
- [ ] `cd web && npx tsc -b` exits 0; full web suite passes incl. new test
- [ ] `grep -n "staleTime: 5 \* 60_000" web/src/api/queries.ts` → 1 match
- [ ] Only in-scope files changed
- [ ] `plans/README.md` row updated

## STOP conditions

- `web/src/api/queryClient.ts` does not exist (plan 003 not done) — stop; do not create it differently.
- `wrangler.jsonc` `run_worker_first` no longer excludes `/assets/*` (then `_headers` would not apply).

## Maintenance notes

- If Vite's `build.assetsDir` ever changes from `assets`, update `_headers`.
- If an "online now" counter is shown again, 5-minute bootstrap staleness means presence updates only on refetch — move the heartbeat to its own small endpoint then.
- Follow-ups considered, not included: edge-caching `/api/bootstrap` aggregates; parallelising sequential D1 awaits in `worker/routes/threads.ts`/`records.ts`; serving Doc record JSON with the HTML.
