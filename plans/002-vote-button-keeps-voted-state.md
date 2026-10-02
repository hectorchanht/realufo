# Plan 002: Vote buttons show the real "voted" state and report failures

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 218df89..HEAD -- web/src/components/VoteButton.tsx web/src/components/ThreadRow.tsx web/src/api/queries.ts web/src/tests/components.test.tsx web/src/tests/thread.test.tsx`
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

Voting (▲) is the main community interaction on realufo.org (anonymous; no accounts). Today a tap turns the button green for a moment, then it goes grey again while the count stays +1. A second tap silently *removes* the vote (the hook knows you voted; the button doesn't). After a reload every button looks un-voted. A rate-limited vote (HTTP 429) is rolled back with no message. Cause: `VoteButton` only knows "voted" from a `voted` prop that no caller passes, while the true state lives in a localStorage map inside `api/queries.ts`. After this plan the button reads that map, so it stays green across re-renders and reloads, and failures show a toast.

## Current state

- `web/src/components/VoteButton.tsx:27-45`:
  ```tsx
  export function VoteButton({ targetType, targetId, votes, voted = false }: VoteButtonProps) {
    const vote = useVote();
    const [overlay, setOverlay] = useState<{ voted: boolean; votes: number } | null>(null);
    useEffect(() => {
      setOverlay(null);
    }, [voted, votes]);
    const isVoted = overlay?.voted ?? voted;
    const displayVotes = overlay?.votes ?? votes;
    function handleClick() {
      const nextVoted = !isVoted;
      setOverlay({ voted: nextVoted, votes: displayVotes + (nextVoted ? 1 : -1) });
      navigator.vibrate?.(5);
      vote.mutate({ target_type: targetType, target_id: targetId });
    }
  ```
  The overlay is cleared as soon as `votes` changes (useVote's `onMutate` bumps the cached count immediately), and then `isVoted` falls back to `voted`, which is `false` for every caller.
- Callers (none pass `voted` except ThreadRow, which defaults it to false): `screens/Doc.tsx:798`, `screens/Case.tsx:178`, `screens/Thread.tsx:197,199`, `components/ThreadRow.tsx:28,35` (`export function ThreadRow({ thread, voted = false }`).
- `web/src/api/queries.ts:389-473` — `useVote()`:
  - line 391: `const VOTABLE_RESOURCES = new Set(["feed", "record", "comments", "boardThreads", "thread"]);` — query caches scanned for optimistic patches. Missing: `"caseComments"` (Case page comments), `"threadSearch"` (Boards search results), `"hub"` (hub pages). Query key names are in `qk` at lines 56-72.
  - lines 399-421: private `votedMapGet()`, `votedMapSet()`, `votedKey(targetType, targetId)` → `"thread:th1"`; map stored in localStorage key `ufo_voted`.
  - lines 438-455 `onMutate`: patches caches in a loop, THEN `votedMapSet(key, !wasVoted)` (line 453).
  - lines 456-460 `onError`: rolls back silently.
- Server error text for rate limit: `worker/routes/votes.ts:22` returns 429 `"slow down — too many votes"`. `ApiError` (with `.status`) is exported from `web/src/api/client.ts:12`.
- Toasts: `const { toast } = useOverlay()` from `web/src/overlays/OverlayProvider.tsx`. Pattern to copy — `web/src/overlays/Composer.tsx:115-125`:
  ```ts
  if (err instanceof ApiError && err.status === 429) {
    toast("slow down — too many posts");
  } else { toast("Could not post — try again"); }
  ```
- Tests that mock `useVote` and assert single-argument calls (will break once `mutate` gets a 2nd options arg): `web/src/tests/components.test.tsx:83` and `:255` (`expect(mockMutate).toHaveBeenCalledWith({ target_type: "thread", target_id: "th1" })`), `web/src/tests/thread.test.tsx:170` (`mockVoteMutate`). `components.test.tsx` renders `VoteButton` with NO OverlayProvider; `useOverlay()` throws outside a provider. `thread.test.tsx` and `case.test.tsx` already mock `../overlays/OverlayProvider`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Web tests | `cd web && NODE_OPTIONS=--no-experimental-webstorage npx vitest run` | all pass |
| Typecheck | `cd web && npx tsc -b` | exit 0 |
| Lint | `cd web && npx oxlint src` | 0 errors |

## Scope

**In scope**:
- `web/src/api/queries.ts` (export a getter, extend `VOTABLE_RESOURCES`, reorder `votedMapSet`)
- `web/src/components/VoteButton.tsx`
- `web/src/components/ThreadRow.tsx` (drop the `false` default)
- `web/src/tests/components.test.tsx`, `web/src/tests/thread.test.tsx`, and any other test file that fails only because of the new `mutate` 2nd argument or a missing `useOverlay` mock (adjust mocks/assertions only)

**Out of scope**:
- `worker/` — server vote logic is fine.
- Server-side "did I vote" state — the localStorage map is the source of truth by design (anonymous app).

## Git workflow

- Worktree branch `advisor/002-vote-state`; conventional commits (`fix(votes): …`); do NOT push.

## Steps

### Step 1: queries.ts

1. Export a reader below `votedKey`:
   ```ts
   /** This browser's own record of whether it voted on a target. */
   export function isVotedLocally(targetType: VoteTargetType, targetId: string): boolean {
     return !!votedMapGet()[votedKey(targetType, targetId)];
   }
   ```
2. Line 391: add `"caseComments", "threadSearch", "hub"` to `VOTABLE_RESOURCES`.
3. In `onMutate`, move `votedMapSet(key, !wasVoted);` to directly after `const delta = …` (before the patch loop), so the map is already updated when the cache patch triggers a re-render.

**Verify**: `cd web && npx tsc -b` → exit 0.

### Step 2: VoteButton

- Change the signature to `{ targetType, targetId, votes, voted }` (no default).
- Compute `const baseVoted = voted ?? isVotedLocally(targetType, targetId);` each render and use `const isVoted = overlay?.voted ?? baseVoted;`.
- Add `const { toast } = useOverlay();` and call
  ```ts
  vote.mutate(
    { target_type: targetType, target_id: targetId },
    { onError: (err) => toast(err instanceof ApiError && err.status === 429 ? "slow down — too many votes" : "Vote didn't go through — try again") },
  );
  ```
- Update the file header comment: the overlay bridges the gap until the cache patch lands; afterwards the localStorage map (`isVotedLocally`) is the truth.

### Step 3: ThreadRow

`export function ThreadRow({ thread, voted }: ThreadRowProps)` (remove `= false`), keep passing `voted={voted}`. Update its prop doc comment: "omit to use this browser's stored vote".

**Verify**: `cd web && npx tsc -b` → exit 0.

### Step 4: Tests

1. `components.test.tsx`: add `const mockToast = vi.fn();` and `vi.mock("../overlays/OverlayProvider", () => ({ useOverlay: () => ({ toast: mockToast }) }));`. Change both single-arg assertions to `toHaveBeenCalledWith({ target_type: "thread", target_id: "th1" }, expect.anything())`.
2. `thread.test.tsx:170`: same `expect.anything()` second argument.
3. Add to the `VoteButton` describe in `components.test.tsx`:
   - "reads stored vote when no prop": `localStorage.setItem("ufo_voted", JSON.stringify({ "thread:th9": true }))`, render `<VoteButton targetType="thread" targetId="th9" votes={3} />`, expect the button `aria-pressed="true"`. Clean up with `localStorage.removeItem("ufo_voted")`.
   - "stays voted after the count prop catches up": render with `votes={3}` (no stored vote), click, then `localStorage.setItem("ufo_voted", JSON.stringify({ "thread:th9": true }))` (simulating the mocked hook's map write) and `rerender(<VoteButton … votes={4} />)`; expect `aria-pressed="true"` and text `4`.
   - "429 shows a toast": click, take `mockMutate.mock.calls.at(-1)[1].onError`, call it with `new ApiError(429, "x")` (import from `../api/client`), expect `mockToast` called with `"slow down — too many votes"`.
4. Run the full suite; for any other file failing with `useOverlay must be used within an OverlayProvider` or a 1-vs-2-argument `toHaveBeenCalledWith` mismatch on a vote mutate, apply the same two fixes.

**Verify**: full web test command → all pass.

## Test plan

Covered in Step 4 (3 new tests + adjusted assertions). Pattern: existing `describe("VoteButton")` in `web/src/tests/components.test.tsx:74-91`.

## Done criteria

- [ ] `cd web && npx tsc -b` exits 0
- [ ] Full web test suite passes; 3 new VoteButton tests exist
- [ ] `grep -n "voted = false" web/src/components/VoteButton.tsx web/src/components/ThreadRow.tsx` → no matches
- [ ] `grep -n '"caseComments"' web/src/api/queries.ts` → a match inside `VOTABLE_RESOURCES`
- [ ] Only in-scope files changed
- [ ] `plans/README.md` row updated

## STOP conditions

- `useVote`'s structure differs from the excerpt (e.g. the voted map moved server-side).
- A test outside the listed files fails for a reason other than the two mechanical fixes in Step 4.4.
- Fixing requires changing `worker/`.

## Maintenance notes

- The `voted` prop is now an override; normal callers should omit it.
- If a server-side "my votes" endpoint is ever added, `isVotedLocally` is the one place to swap.
- Reviewer: tap ▲ twice quickly on a thread row — count must go +1 then back, button green then grey, no flicker back to grey after the first tap.
