# Plan 004: Back (‹ and Esc) on a deep-linked page goes to its parent page instead of leaving the site

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 218df89..HEAD -- web/src/components/navItems.ts web/src/components/AppShell.tsx web/src/screens/Doc.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (if plan 008 lands first, see Step 1 note on `/cases`)
- **Category**: bug
- **Planned at**: commit `218df89`, 2026-10-02

## Why this matters

Most realufo.org visitors arrive from search results or shared links directly on a detail page (`/doc/:id`, `/thread/:id`, `/case/:slug`, hub pages). The app's back chevron (‹) and the Doc page's Esc key call `navigate(-1)` unconditionally, so on a landing page they take the visitor back to Google, or do nothing in a fresh tab. After this plan, when there is no earlier in-app page, back goes to the page's logical parent (e.g. a file → the Archive) and replaces the history entry.

## Current state

- `web/src/components/AppShell.tsx:109,119` — both back buttons:
  ```tsx
  <TopNav activeTab={activeTab} canBack={canBack} onBack={() => navigate(-1)} />
  <AppBar canBack={canBack} onBack={() => navigate(-1)} showBrand={!canBack} hidden={navHidden} />
  ```
  `pathname` is available from `useLocation()` (line 45), `navigate` from `useNavigate()` (line 46).
- `web/src/screens/Doc.tsx:320-321` — inside a keydown handler:
  ```ts
  } else if (e.key === "Escape") {
    navigate(-1);
  ```
  The record id is `id` from `useParams()`.
- `web/src/components/navItems.ts:55-57` — `canBackForPath(pathname)` shows the chevron on every path that isn't a nav root (`/`, `/archive`, `/ask`, `/boards`, `/map`). Routes (from `web/src/router.tsx`): `/doc/:id`, `/thread/:id`, `/board/:slug`, `/case/:slug`, `/browse`, `/release|agency|location|decade/:slug`.
- react-router v7's browser history stores the in-app history position as `window.history.state.idx` (0 = the first page loaded in this tab; `replace` navigations keep the same idx). The overlay system pushes extra entries with `{ ...window.history.state, overlay: true }`, which preserves `idx`. In tests (memory router, jsdom) `window.history.state` is `null`.
- Tests for nav helpers live in `web/src/tests/hub.test.tsx:89` (`activeTabForPath`); shell behaviour tests in `web/src/tests/shell.test.tsx` using `renderAppAt` from `web/src/tests/util.tsx`. Screen markers: `data-screen="boards"`, `"archive"`, etc.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Web tests | `cd web && NODE_OPTIONS=--no-experimental-webstorage npx vitest run` | all pass |
| Typecheck | `cd web && npx tsc -b` | exit 0 |
| Lint | `cd web && npx oxlint src` | 0 errors |

## Scope

**In scope**: `web/src/components/navItems.ts`, `web/src/components/AppShell.tsx`, `web/src/screens/Doc.tsx` (Esc line only), `web/src/tests/navBack.test.tsx` (create)

**Out of scope**: overlay history handling in `web/src/overlays/OverlayProvider.tsx`; `canBackForPath` behaviour.

## Git workflow

- Worktree branch `advisor/004-back-fallback`; conventional commits (`fix(nav): …`); do NOT push.

## Steps

### Step 1: Helpers in navItems.ts

Add:
```ts
/** Where "back" goes when this page was the first one opened in the tab. */
export function parentPath(pathname: string): string {
  if (pathname.startsWith("/doc/")) return "/archive";
  if (pathname.startsWith("/thread/") || pathname.startsWith("/board/")) return "/boards";
  if (pathname.startsWith("/case/")) return "/map";
  if (/^\/(release|agency|location|decade)\//.test(pathname)) return "/browse";
  if (pathname === "/browse") return "/archive";
  return "/";
}

/** In-app back: history when there is an earlier in-app page, else the parent page. */
export function goBack(navigate: (to: string | number, opts?: { replace?: boolean }) => void, pathname: string): void {
  const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
  if (idx > 0) navigate(-1);
  else navigate(parentPath(pathname), { replace: true });
}
```
If `navigate`'s type from `useNavigate()` does not accept this signature, type the parameter as `ReturnType<typeof useNavigate>` (import `useNavigate` type from `react-router-dom`) and call `navigate(-1)` / `navigate(path, { replace: true })`.

Note: if plan 008 (cold cases index) has landed and `/cases` exists in `web/src/router.tsx`, return `"/cases"` for `/case/` and `"/"` for `/cases`.

**Verify**: `cd web && npx tsc -b` → exit 0.

### Step 2: Use it

- AppShell lines 109 and 119: `onBack={() => goBack(navigate, pathname)}`.
- Doc.tsx Esc branch: `goBack(navigate, \`/doc/${id}\`);` (import `goBack` from `../components/navItems`).

**Verify**: `cd web && npx tsc -b` → exit 0; `grep -n "navigate(-1)" web/src/components/AppShell.tsx web/src/screens/Doc.tsx` → no matches.

### Step 3: Tests

Create `web/src/tests/navBack.test.tsx`:
1. `parentPath`: `/doc/X`→`/archive`, `/thread/t1`→`/boards`, `/board/uap`→`/boards`, `/case/roswell`→`/map` (or `/cases`, matching Step 1), `/release/6`→`/browse`, `/browse`→`/archive`, `/whatever`→`/`.
2. Shell: `renderAppAt("/board/uap")`, click the button with accessible name "Back" (`screen.getByRole("button", { name: "Back" })`; AppBar's back button has `aria-label="Back"`), then `await waitFor(() => expect(document.querySelector("[data-screen='boards']")).toBeInTheDocument())`.

**Verify**: full web test command → all pass.

## Test plan

Step 3. Pattern: `web/src/tests/shell.test.tsx` for `renderAppAt` + `waitFor`.

## Done criteria

- [ ] `cd web && npx tsc -b` exits 0; lint 0 errors
- [ ] Full web suite passes incl. `navBack.test.tsx`
- [ ] No `navigate(-1)` left in AppShell.tsx / Doc.tsx (outside `goBack`)
- [ ] Only in-scope files changed
- [ ] `plans/README.md` row updated

## STOP conditions

- `window.history.state.idx` is not set by the installed react-router (check: in the browser preview, `history.state` after a client navigation shows an `idx` number). If absent, stop and report.
- The AppBar back button has no `aria-label="Back"` (then report the actual accessible name instead of guessing).

## Maintenance notes

- New detail routes need a `parentPath` entry or they fall back to `/`.
- Reviewer: open a `/doc/...` URL in a fresh tab and press ‹ → lands on `/archive` (still on the site); open Archive → a file → ‹ → back on Archive with its filters.
