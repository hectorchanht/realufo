# Plan 001: Media-tool changes on a file page no longer jump the page to the top

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 218df89..HEAD -- web/src/lib/useScrollMemory.ts web/src/components/AppShell.tsx web/src/components/ImageTools.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `218df89`, 2026-10-02

## Why this matters

realufo.org is a React SPA (web/) for browsing declassified UAP files. On a file page (`/doc/:id`), the image/video tools (brightness/contrast sliders, lens, magnification) store their state in the URL query string (`?br=120&lens=1&mag=3`) via `replace` navigations. The app shell remembers scroll position per `pathname + search`, so every slider tick produces a *new* key with no saved position and the shell scrolls the page back to the top. The tool panel sits below a media panel up to 78vh tall, so on phones the tools are close to unusable: each tick throws the user to the top. After this plan, media-tool params are ignored when computing the scroll key, so adjusting tools keeps the scroll position.

## Current state

- `web/src/lib/useScrollMemory.ts` — saves/restores the shell's scrollTop per key; on a key with no saved position it scrolls to 0.
  ```ts
  // web/src/lib/useScrollMemory.ts:13-17
  export function useScrollMemory(ref: RefObject<HTMLElement | null>, key: string): void {
    useLayoutEffect(() => {
      const el = ref.current;
      if (!el) return;
      const target = saved.get(key) ?? 0;
  ```
- `web/src/components/AppShell.tsx:66-67` — the key is the full path + query:
  ```ts
  useScrollMemory(scrollRef, pathname + search);
  const navHidden = useHideOnScroll(scrollRef, !isDesktop, pathname + search);
  ```
  (`pathname`, `search` come from `useLocation()` at line 45.)
- `web/src/components/ImageTools.tsx:39-41` — the canonical list of media-tool query params:
  ```ts
  const ADJUST_PARAMS = ["br", "ct", "sat", "inv", "bw", "pal", "sharp"];
  export const TOOL_PARAMS = [...ADJUST_PARAMS, "lens", "mag"];
  ```
- `web/src/screens/Doc.tsx:183-195` writes those params with `setSearchParams(sp, { replace: true })` on every slider change (do not modify Doc.tsx).
- Other query params (Archive filters like `type`, `q`, `page`; Doc's forwarded list filters) MUST keep producing distinct keys — e.g. Archive page 2 should start at the top and Back to page 1 should restore page 1's scroll. Existing test `web/src/tests/shell.test.tsx` ("tabs reopen their last URL and each URL gets its scroll back") relies on `/archive?type=video` being its own key.
- Convention: small pure helpers live in `web/src/lib/*.ts` and get a unit test in `web/src/tests/<name>.test.ts` (see `web/src/tests/docTitle.test.ts` for a minimal pure-function test).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Web tests | `cd web && NODE_OPTIONS=--no-experimental-webstorage npx vitest run` | all pass (241 at plan time + new ones) |
| One test file | `cd web && NODE_OPTIONS=--no-experimental-webstorage npx vitest run src/tests/scrollKey.test.ts` | pass |
| Typecheck | `cd web && npx tsc -b` | exit 0, no output |
| Lint | `cd web && npx oxlint src` | 0 errors (3 pre-existing `only-export-components` warnings are fine) |

`NODE_OPTIONS=--no-experimental-webstorage` is required on Node ≥ 25: Node's built-in `localStorage` otherwise shadows jsdom's and unrelated tests fail with `localStorage.clear is not a function`.

## Scope

**In scope**:
- `web/src/lib/useScrollMemory.ts` (add an exported pure function)
- `web/src/components/AppShell.tsx` (use it for both hooks)
- `web/src/tests/scrollKey.test.ts` (create)

**Out of scope**:
- `web/src/screens/Doc.tsx`, `web/src/components/ImageTools.tsx` — the URL-sync of tool state is intended (shareable links); do not change it.
- `web/src/lib/useHideOnScroll.ts` internals.

## Git workflow

- Other agents share this checkout: work in a git worktree on branch `advisor/001-scroll-key`.
- Conventional commits, e.g. `fix(doc): media-tool changes keep the scroll position`.
- Do NOT push.

## Steps

### Step 1: Add `scrollKey()` and its test

In `web/src/lib/useScrollMemory.ts` add (and import `TOOL_PARAMS` from `../components/ImageTools`):

```ts
/** Scroll-memory key for a URL: media-tool params (?br=, ?lens=, …) only restyle
 * the file page, so they must not count as a new page. */
export function scrollKey(pathname: string, search: string): string {
  const sp = new URLSearchParams(search);
  for (const k of TOOL_PARAMS) sp.delete(k);
  const qs = sp.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}
```

Create `web/src/tests/scrollKey.test.ts` with cases:
1. `scrollKey("/doc/X", "?br=120&lens=1&mag=4")` equals `scrollKey("/doc/X", "")` and equals `"/doc/X"`.
2. `scrollKey("/archive", "?type=video&page=2")` equals `"/archive?type=video&page=2"`.
3. `scrollKey("/doc/X", "?q=roswell&ct=140")` equals `"/doc/X?q=roswell"`.

**Verify**: `cd web && NODE_OPTIONS=--no-experimental-webstorage npx vitest run src/tests/scrollKey.test.ts` → 3 tests pass.

### Step 2: Use it in AppShell

In `web/src/components/AppShell.tsx` replace lines 66-67 with:

```ts
const key = scrollKey(pathname, search);
useScrollMemory(scrollRef, key);
const navHidden = useHideOnScroll(scrollRef, !isDesktop, key);
```

and import `scrollKey` alongside `useScrollMemory`.

**Verify**: `cd web && npx tsc -b` → exit 0; `cd web && NODE_OPTIONS=--no-experimental-webstorage npx vitest run src/tests/shell.test.tsx` → all pass.

### Step 3: Full suite

**Verify**: full web test command → all pass; lint → 0 errors.

## Test plan

- New `web/src/tests/scrollKey.test.ts` (3 cases above).
- Existing `shell.test.tsx` scroll-restore test must still pass (proves non-tool params still key separately).

## Done criteria

- [ ] `cd web && npx tsc -b` exits 0
- [ ] Full web test suite passes including 3 new tests
- [ ] `grep -n "pathname + search" web/src/components/AppShell.tsx` returns no matches
- [ ] Only the 3 in-scope files changed (`git status`)
- [ ] `plans/README.md` row updated

## STOP conditions

- `TOOL_PARAMS` is not exported from `web/src/components/ImageTools.tsx` or has different contents.
- `shell.test.tsx` fails after Step 2 and the failure is not caused by a typo.
- Importing `../components/ImageTools` from `lib/useScrollMemory.ts` creates a circular-import error at test or build time.

## Maintenance notes

- Any new URL param that only restyles a page (not a new list/page) should be added to `TOOL_PARAMS` or excluded in `scrollKey`.
- Reviewer: check the hide-on-scroll hook also uses the new key (tool changes shouldn't pop the mobile nav back).
