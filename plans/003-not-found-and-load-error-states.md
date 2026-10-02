# Plan 003: Real 404 page, route error screen, and "couldn't load" states with retry

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 218df89..HEAD -- web/src/main.tsx web/src/router.tsx web/src/screens/Doc.tsx web/src/screens/Thread.tsx web/src/screens/Case.tsx web/src/screens/Archive.tsx web/src/screens/Feed.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none (plan 006 builds on the `queryClient.ts` file created here)
- **Category**: bug
- **Planned at**: commit `218df89`, 2026-10-02

## Why this matters

Four problems, one theme, on realufo.org (React SPA in `web/`, react-router v7 data router, TanStack Query v5):
1. **No 404 route and no error boundary.** A mistyped/old URL, or a lazy screen chunk that fails to load after a deploy, replaces the whole app (nav included) with react-router's bare "Unexpected Application Error" page. The Worker even promises a SPA not-found screen (`worker/lib/meta.ts:81`: "the SPA still boots and shows its own not-found screen") that doesn't exist.
2. **Dead links spin ~7 s.** `new QueryClient()` retries every failed query 3× with backoff, including 404s, so a missing file/thread/case shows "loading signal…" for ~7 s.
3. **Network errors masquerade as "not found".** Doc/Thread/Case show "file not found." for a 500 or offline too, with no retry.
4. **Lists show "empty" when the request failed.** Archive says "no records match", Feed shows an empty grid, Doc says "0 comments".
After this plan: an in-shell 404 page, an in-shell error screen with reload for chunk failures, no retries on 4xx, and a shared `LoadError` with a retry button.

## Current state

- `web/src/main.tsx:17` — `const queryClient = new QueryClient()` (no options).
- `web/src/router.tsx:22-42` — route table; all screens are children of one `{ element: <AppShell />, children: [...] }` route; no `path: "*"`, no `errorElement`. Lazy screens use the `screen(() => import(...))` helper (lines 14-16).
- `web/src/api/client.ts:12-19` — `export class ApiError extends Error { status: number; … }` thrown for any non-2xx.
- Detail screens, same shape in all three:
  ```tsx
  // web/src/screens/Doc.tsx:154,358-372
  const { data: detail, isLoading } = useRecord(id);
  if (isLoading) { return (<div data-screen="doc" className="font-mono text-[11px] text-faint">◉ loading signal…</div>); }
  if (!record) { return (<div data-screen="doc" className="px-5 py-[60px] text-center font-mono text-[12px] text-faint">file not found.</div>); }
  ```
  `web/src/screens/Thread.tsx:226-240` ("thread not found."), `web/src/screens/Case.tsx:36,49-63` ("case not found.").
- Lists:
  - `web/src/screens/Archive.tsx:383` `const { data, isLoading, isPlaceholderData } = useRecords(...)`; `:578-584` empty state `{count === 0 && (<div …>no records match.<br />the truth is elsewhere.</div>)}`.
  - `web/src/screens/Feed.tsx:83` `const { data: feed, isLoading: feedLoading } = useFeed();` grid at `:91-110`, threads list at `:120-128`.
  - `web/src/screens/Doc.tsx:155` `const { data: commentsData } = useComments(id);` count at `:754`, list at `:775`.
- Existing retry UI to copy (styling + copy tone) — `web/src/components/AskAnswer.tsx:57-68`:
  ```tsx
  <div className={`${CARD} flex items-center gap-3 font-mono text-[11px] text-dim`}>
    <span className="flex-1">{copy ?? "Couldn't reach the archive — try again"}</span>
    <button type="button" onClick={() => refetch()} className="rounded-md border border-line2 px-2 py-0.5 text-signal">retry</button>
  </div>
  ```
- Test harness: `web/src/tests/util.tsx` `renderAppAt(path)` renders the real route table in a memory router with `retry:false`. Screen tests such as `web/src/tests/thread.test.tsx` mock `../api/queries` hooks with `vi.fn()` returning `{ data, isLoading }`.
- Voice/copy: lowercase terminal-ish ("◉ loading signal…", "the truth is elsewhere.").

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Web tests | `cd web && NODE_OPTIONS=--no-experimental-webstorage npx vitest run` | all pass |
| Typecheck | `cd web && npx tsc -b` | exit 0 |
| Lint | `cd web && npx oxlint src` | 0 errors |

## Scope

**In scope**:
- `web/src/api/queryClient.ts` (create), `web/src/main.tsx`
- `web/src/components/LoadError.tsx` (create), `web/src/components/RouteError.tsx` (create), `web/src/screens/NotFound.tsx` (create)
- `web/src/router.tsx`
- `web/src/screens/Doc.tsx`, `Thread.tsx`, `Case.tsx`, `Archive.tsx`, `Feed.tsx` (only the loading/not-found/empty branches)
- Tests: `web/src/tests/loadError.test.tsx` (create), plus mock-shape updates in existing screen tests if needed

**Out of scope**:
- `Boards.tsx`, `Browse.tsx`, `Board.tsx`, `Hub.tsx`, `Map.tsx`, `Ask.tsx` — follow-up (note in README).
- `worker/` — the Worker already returns real 404 statuses.
- Any query's own `retry` override (`useAsk`, `useHub` keep `retry:false`).

## Git workflow

- Worktree branch `advisor/003-error-states`; conventional commits (`fix(app): …`); do NOT push.

## Steps

### Step 1: Query client with a sane retry policy

Create `web/src/api/queryClient.ts`:
```ts
import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./client";

/** 4xx won't change on retry (a missing file stays missing); network/5xx get 2 retries. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
  return failureCount < 2;
}

export function makeQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: shouldRetry } } });
}
```
In `web/src/main.tsx` replace `const queryClient = new QueryClient()` with `const queryClient = makeQueryClient()` and drop the now-unused `QueryClient` import (keep `QueryClientProvider`).

**Verify**: `cd web && npx tsc -b` → exit 0.

### Step 2: `LoadError` component

Create `web/src/components/LoadError.tsx`:
```tsx
import { ApiError } from "../api/client";

/** Failed query → "not found" for a 404 (or no error at all), otherwise a retry line. */
export function LoadError({ error, onRetry, notFound }: { error: unknown; onRetry: () => void; notFound?: string }) {
  const missing = !error || (error instanceof ApiError && error.status === 404);
  if (missing && notFound)
    return <div className="px-5 py-[60px] text-center font-mono text-[12px] text-faint">{notFound}</div>;
  return (
    <div role="alert" className="flex items-center gap-3 rounded-xl border border-line px-[14px] py-3 font-mono text-[11px] text-dim">
      <span className="flex-1">couldn't reach the archive — check your connection.</span>
      <button type="button" onClick={onRetry} className="rounded-md border border-line2 px-2 py-0.5 text-signal">retry</button>
    </div>
  );
}
```

### Step 3: Detail screens

In each of Doc, Thread, Case: destructure `error, refetch` from the main query (`useRecord`, `useThread`, `useCase`) and replace the `if (!record|thread|caseDetail) return (…not found…)` block with the same wrapper div (keep its `data-screen` attribute) containing
`<LoadError error={error} onRetry={() => void refetch()} notFound="file not found." />` (Thread: `"thread not found."`, Case: `"case not found."`). Keep the existing `isLoading` branch.

**Verify**: `cd web && npx tsc -b` → exit 0; `NODE_OPTIONS=--no-experimental-webstorage npx vitest run src/tests/doc.test.tsx src/tests/thread.test.tsx src/tests/case.test.tsx` → pass (existing "not found" tests return `data: undefined` with no error → still render the not-found text).

### Step 4: Lists

- Archive: destructure `isError, refetch` from `useRecords`. Where the empty state renders (`count === 0 && …`), render `isError && !data ? <LoadError error={error} onRetry={() => void refetch()} /> : count === 0 && (…existing empty state…)` (no `notFound` prop → always the retry line). Destructure `error` too.
- Feed: destructure `isError, error, refetch` from `useFeed()`. When `isError && !feed`, render one `<LoadError … />` in place of the "Hot right now" grid contents and render nothing for the threads list.
- Doc comments: destructure `isError: commentsError, refetch: refetchComments` (and `error`) from `useComments(id)`; when it is true and `!commentsData`, render `<LoadError … />` in place of the comment list and hide the "N comments" count.

**Verify**: `cd web && npx tsc -b` → exit 0.

### Step 5: 404 route + route error boundary

Create `web/src/screens/NotFound.tsx` (default export):
```tsx
import { Link } from "react-router-dom";
import { useSetPageTitle } from "../lib/pageTitle";

export default function NotFound() {
  useSetPageTitle("NOT FOUND", "");
  return (
    <div data-screen="not-found" className="px-5 py-[60px] text-center font-mono text-[12px] text-faint">
      signal lost — no page at this address.
      <div className="mt-4 flex justify-center gap-4 text-signal">
        <Link to="/">feed</Link>
        <Link to="/archive">archive</Link>
      </div>
    </div>
  );
}
```
(Confirm `useSetPageTitle(title, sub)` signature in `web/src/lib/pageTitle.tsx`; Feed calls `useSetPageTitle("REALUFO", "Declassified UAP archive + forum")`.)

Create `web/src/components/RouteError.tsx`:
```tsx
import { useRouteError } from "react-router-dom";

// Lazy screen chunks 404 after a deploy (old hashed filename) → offer a reload.
const CHUNK_RE = /dynamically imported module|Importing a module script failed|Failed to fetch|error loading dynamically/i;

export function RouteError() {
  const err = useRouteError();
  const msg = err instanceof Error ? err.message : String(err ?? "");
  const stale = CHUNK_RE.test(msg);
  return (
    <div data-screen="route-error" role="alert" className="px-5 py-[60px] text-center font-mono text-[12px] text-faint">
      {stale ? "a newer version of the site is live." : "something broke on this page."}
      <div className="mt-4">
        <button type="button" onClick={() => window.location.reload()} className="rounded-md border border-line2 px-3 py-1 text-signal">reload</button>
      </div>
    </div>
  );
}
```

In `web/src/router.tsx`, wrap the existing children in a pathless route that owns the error boundary, and add the catch-all **last**:
```tsx
{
  element: <AppShell />,
  children: [
    {
      errorElement: <RouteError />,
      children: [
        /* …every existing child route, unchanged… */
        { path: "*", element: <NotFound /> },
      ],
    },
  ],
},
```
Import `NotFound` eagerly (it is tiny) and `RouteError`. The pathless route has no `element`, so it renders its children through AppShell's `<Outlet />` and errors render *inside* the shell (nav stays).

**Verify**: `cd web && npx tsc -b` → exit 0.

### Step 6: Tests

Create `web/src/tests/loadError.test.tsx`:
1. `shouldRetry(0, new ApiError(404, "x"))` → false; `shouldRetry(0, new Error("net"))` → true; `shouldRetry(2, new Error("net"))` → false.
2. `<LoadError error={new ApiError(404,"x")} onRetry={fn} notFound="file not found." />` shows "file not found." and no retry button.
3. `<LoadError error={new ApiError(500,"x")} onRetry={fn} notFound="file not found." />` shows a "retry" button; clicking calls `fn`.
4. `renderAppAt("/definitely-not-a-page")` → `await screen.findByText(/signal lost/)` and the nav (`[data-bottomtab], [data-topnav]`) is still in the document (pattern: `web/src/tests/shell.test.tsx`).

**Verify**: full web test command → all pass.

## Test plan

Step 6 (4+ tests). Existing not-found tests in doc/thread/case tests must still pass unchanged.

## Done criteria

- [ ] `cd web && npx tsc -b` exits 0; lint 0 errors
- [ ] Full web suite passes, including `loadError.test.tsx`
- [ ] `grep -n 'path: "\*"' web/src/router.tsx` → 1 match; `grep -n "errorElement" web/src/router.tsx` → 1 match
- [ ] `grep -n "new QueryClient()" web/src/main.tsx` → no matches
- [ ] Only in-scope files changed
- [ ] `plans/README.md` row updated

## STOP conditions

- The route table no longer has a single AppShell parent route.
- `useSetPageTitle`, `useThread` or `useCase` signatures differ from the excerpts.
- An existing screen test asserts the 3-retry behaviour or breaks for a reason other than mock shape.

## Maintenance notes

- New screens should use `LoadError` for their primary query's failure branch.
- Follow-up (not in this plan): Boards, Board, Browse, Hub, Map, Case comments.
- Reviewer: open `/doc/NOPE` — "file not found." must appear within ~1 s (no retry backoff); disconnect network on Archive — retry line, not "no records match".
